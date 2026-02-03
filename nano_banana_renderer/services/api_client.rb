# frozen_string_literal: true

require 'net/http'
require 'uri'
require 'json'
require 'base64'

module NanoBanana
  # Gemini API 통신 클라이언트
  class ApiClient
    ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'
    MODEL_INFO_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview'
    TIMEOUT = 180 # Pro 모델은 시간이 더 오래 걸릴 수 있음
    MAX_RETRIES = 3

    def initialize(api_key)
      @api_key = api_key
    end

    # 단일 이미지 + 프롬프트로 생성
    def generate(image_base64, prompt)
      body = build_single_image_body(image_base64, prompt)
      send_request(body)
    end

    # 씬 분석 (텍스트만 응답) - Convert용
    def analyze_scene(image_base64, prompt)
      body = build_text_only_body(image_base64, prompt)
      send_request(body)
    end

    # 다중 이미지 + 프롬프트로 생성 (오브젝트 배치용)
    def generate_with_references(base_image, reference_images, prompt)
      body = build_multi_image_body(base_image, reference_images, prompt)
      send_request(body)
    end

    # API 연결 테스트
    def test_connection
      uri = URI(MODEL_INFO_ENDPOINT)
      uri.query = URI.encode_www_form(key: @api_key)

      http = create_http_client(uri)
      request = Net::HTTP::Get.new(uri)

      response = http.request(request)
      response.code == '200'
    rescue StandardError => e
      puts "[NanoBanana] API 연결 테스트 실패: #{e.message}"
      false
    end

    # API Key 유효성 검사
    def valid_api_key?
      return false if @api_key.nil? || @api_key.empty?
      test_connection
    end

    private

    # 단일 이미지 요청 본문 구성 (이미지 생성)
    def build_single_image_body(image_base64, prompt)
      {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: detect_mime_type(image_base64),
                  data: image_base64
                }
              },
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
      }
    end

    # 텍스트만 응답받는 요청 본문 (씬 분석용)
    def build_text_only_body(image_base64, prompt)
      {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: detect_mime_type(image_base64),
                  data: image_base64
                }
              },
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['TEXT']
        }
      }
    end

    # 다중 이미지 요청 본문 구성
    def build_multi_image_body(base_image, reference_images, prompt)
      parts = []

      # 기본 이미지
      parts << {
        inlineData: {
          mimeType: detect_mime_type(base_image),
          data: base_image
        }
      }

      # 참조 이미지들
      reference_images.each do |ref_image|
        parts << {
          inlineData: {
            mimeType: detect_mime_type(ref_image),
            data: ref_image
          }
        }
      end

      # 프롬프트
      parts << { text: prompt }

      {
        contents: [{ parts: parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
      }
    end

    # HTTP 요청 전송
    def send_request(body, retry_count = 0)
      uri = URI(ENDPOINT)
      uri.query = URI.encode_www_form(key: @api_key)

      http = create_http_client(uri)

      request = Net::HTTP::Post.new(uri)
      request['Content-Type'] = 'application/json'
      request.body = body.to_json

      puts "[NanoBanana] API 요청 전송 중..."
      response = http.request(request)
      puts "[NanoBanana] API 응답: #{response.code}"

      handle_response(response)
    rescue Net::ReadTimeout, Net::OpenTimeout => e
      if retry_count < MAX_RETRIES
        wait_time = 2 ** (retry_count + 1)
        puts "[NanoBanana] 타임아웃, #{wait_time}초 후 재시도 (#{retry_count + 1}/#{MAX_RETRIES})"
        sleep(wait_time)
        send_request(body, retry_count + 1)
      else
        raise TimeoutError, "API 요청 시간 초과 (#{MAX_RETRIES}회 재시도 실패)"
      end
    rescue StandardError => e
      puts "[NanoBanana] API 요청 오류: #{e.message}"
      raise
    end

    # HTTP 클라이언트 생성
    def create_http_client(uri)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.read_timeout = TIMEOUT
      http.open_timeout = 30
      http.verify_mode = OpenSSL::SSL::VERIFY_PEER
      http
    end

    # 응답 처리
    def handle_response(response)
      case response.code.to_i
      when 200
        parse_success_response(response.body)
      when 400
        error_data = JSON.parse(response.body) rescue {}
        raise BadRequestError, "잘못된 요청: #{error_data['error']&.dig('message') || response.body}"
      when 401
        raise AuthenticationError, 'API Key가 유효하지 않습니다.'
      when 403
        raise ForbiddenError, 'API 접근이 거부되었습니다. API Key 권한을 확인하세요.'
      when 429
        raise RateLimitError, '요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.'
      when 500..599
        raise ServerError, "서버 오류가 발생했습니다. (#{response.code})"
      else
        raise ApiError, "알 수 없는 오류: #{response.code} - #{response.body}"
      end
    end

    # 성공 응답 파싱
    def parse_success_response(body)
      data = JSON.parse(body)

      candidates = data['candidates']
      if candidates.nil? || candidates.empty?
        # 안전 필터링 등으로 결과가 없는 경우
        prompt_feedback = data['promptFeedback']
        if prompt_feedback && prompt_feedback['blockReason']
          raise ContentFilterError, "콘텐츠가 필터링되었습니다: #{prompt_feedback['blockReason']}"
        end
        return nil
      end

      # 첫 번째 후보에서 결과 추출
      content = candidates[0]['content']
      return nil unless content

      parts = content['parts']
      return nil unless parts

      result = { text: nil, image: nil }

      parts.each do |part|
        if part['text']
          result[:text] = part['text']
        elsif part['inlineData']
          result[:image] = part['inlineData']['data']
        end
      end

      result
    end

    # MIME 타입 감지
    def detect_mime_type(base64_data)
      # Base64 헤더로 타입 감지
      return 'image/png' if base64_data.start_with?('iVBOR')
      return 'image/jpeg' if base64_data.start_with?('/9j/')
      return 'image/gif' if base64_data.start_with?('R0lGOD')
      return 'image/webp' if base64_data.start_with?('UklGR')

      # 기본값
      'image/png'
    end
  end

  # 커스텀 에러 클래스
  class ApiError < StandardError; end
  class AuthenticationError < ApiError; end
  class ForbiddenError < ApiError; end
  class RateLimitError < ApiError; end
  class ServerError < ApiError; end
  class TimeoutError < ApiError; end
  class BadRequestError < ApiError; end
  class ContentFilterError < ApiError; end
end
