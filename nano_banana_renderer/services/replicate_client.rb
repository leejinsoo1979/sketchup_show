# frozen_string_literal: true

require 'net/http'
require 'uri'
require 'json'
require 'base64'

module NanoBanana
  # Replicate API 클라이언트 - ControlNet으로 구도 유지 + 실사 변환
  class ReplicateClient
    BASE_URL = 'https://api.replicate.com/v1'
    TIMEOUT = 60  # 60초 타임아웃

    # 모델 목록 (구도 유지 + 실사 특화)
    MODELS = {
      # ★ 추천: 10초 이내, 구도 100% 유지
      'photorealistic-fx' => 'batouresearch/photorealistic-fx-controlnet',
      # SDXL + ControlNet (고품질)
      'sdxl-controlnet' => 'fofr/sdxl-multi-controlnet-lora',
      # Canny Edge (윤곽선 기반)
      'flux-canny' => 'black-forest-labs/flux-canny-pro'
    }.freeze

    DEFAULT_MODEL = 'photorealistic-fx'

    def initialize(api_token, model = nil)
      @api_token = api_token
      @model = model || DEFAULT_MODEL
    end

    attr_accessor :model

    # 이미지 변환 (ControlNet - 구도 유지)
    def generate(image_base64, prompt, negative_prompt = '')
      model_id = MODELS[@model] || MODELS[DEFAULT_MODEL]

      # Base64 → URL (Replicate는 URL 또는 data URI 필요)
      image_uri = "data:image/jpeg;base64,#{image_base64}"

      input = build_input(image_uri, prompt, negative_prompt)

      # 예측 생성
      prediction = create_prediction(model_id, input)

      # 결과 대기 (폴링)
      result = wait_for_result(prediction['id'])

      if result && result['output']
        output_url = result['output'].is_a?(Array) ? result['output'].first : result['output']

        # URL에서 이미지 다운로드 → Base64
        image_data = download_image(output_url)
        { image: image_data, text: nil }
      else
        raise ApiError, "생성 실패: #{result['error'] || 'Unknown error'}"
      end
    end

    # API 연결 테스트
    def test_connection
      uri = URI("#{BASE_URL}/models")
      http = create_http_client(uri)

      request = Net::HTTP::Get.new(uri)
      request['Authorization'] = "Bearer #{@api_token}"

      response = http.request(request)
      response.code == '200'
    rescue StandardError => e
      puts "[NanoBanana] Replicate 연결 테스트 실패: #{e.message}"
      false
    end

    def valid_api_key?
      return false if @api_token.nil? || @api_token.empty?
      test_connection
    end

    private

    def build_input(image_uri, prompt, negative_prompt)
      case @model
      when 'photorealistic-fx'
        {
          image: image_uri,
          prompt: prompt,
          negative_prompt: negative_prompt.empty? ? 'cartoon, anime, sketch, drawing, wireframe, outline, black lines' : negative_prompt,
          num_inference_steps: 25,
          guidance_scale: 7.5,
          controlnet_conditioning_scale: 0.8  # 구도 유지 강도 (0.8 = 높음)
        }
      when 'sdxl-controlnet'
        {
          image: image_uri,
          prompt: prompt,
          negative_prompt: negative_prompt,
          num_inference_steps: 30,
          guidance_scale: 7.5,
          controlnet_1: 'edge_canny',
          controlnet_1_conditioning_scale: 0.8
        }
      when 'flux-canny'
        {
          control_image: image_uri,
          prompt: prompt,
          num_inference_steps: 28,
          guidance_scale: 3.5
        }
      else
        {
          image: image_uri,
          prompt: prompt,
          negative_prompt: negative_prompt
        }
      end
    end

    def create_prediction(model_id, input)
      uri = URI("#{BASE_URL}/predictions")
      http = create_http_client(uri)

      request = Net::HTTP::Post.new(uri)
      request['Authorization'] = "Bearer #{@api_token}"
      request['Content-Type'] = 'application/json'
      request.body = {
        version: get_model_version(model_id),
        input: input
      }.to_json

      response = http.request(request)

      unless response.code == '201'
        error_body = JSON.parse(response.body) rescue {}
        raise ApiError, "예측 생성 실패: #{error_body['detail'] || response.code}"
      end

      JSON.parse(response.body)
    end

    def get_model_version(model_id)
      # 모델별 최신 버전 조회
      uri = URI("#{BASE_URL}/models/#{model_id}/versions")
      http = create_http_client(uri)

      request = Net::HTTP::Get.new(uri)
      request['Authorization'] = "Bearer #{@api_token}"

      response = http.request(request)

      if response.code == '200'
        data = JSON.parse(response.body)
        data['results']&.first&.dig('id')
      else
        raise ApiError, "모델 버전 조회 실패: #{model_id}"
      end
    end

    def wait_for_result(prediction_id, max_wait = TIMEOUT)
      start_time = Time.now

      loop do
        elapsed = Time.now - start_time
        raise TimeoutError, "타임아웃 (#{max_wait}초)" if elapsed > max_wait

        uri = URI("#{BASE_URL}/predictions/#{prediction_id}")
        http = create_http_client(uri)

        request = Net::HTTP::Get.new(uri)
        request['Authorization'] = "Bearer #{@api_token}"

        response = http.request(request)
        result = JSON.parse(response.body)

        case result['status']
        when 'succeeded'
          return result
        when 'failed', 'canceled'
          raise ApiError, "생성 실패: #{result['error']}"
        end

        # 1초 대기 후 재확인
        sleep(1)
      end
    end

    def download_image(url)
      uri = URI(url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.read_timeout = 30

      request = Net::HTTP::Get.new(uri)
      response = http.request(request)

      if response.code == '200'
        Base64.strict_encode64(response.body)
      else
        raise ApiError, "이미지 다운로드 실패"
      end
    end

    def create_http_client(uri)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.read_timeout = TIMEOUT
      http.open_timeout = 10
      http.verify_mode = OpenSSL::SSL::VERIFY_PEER
      http
    end
  end
end
