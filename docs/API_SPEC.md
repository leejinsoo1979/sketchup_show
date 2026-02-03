# Gemini API 연동 명세

## 1. API 개요

| 항목 | 값 |
|------|-----|
| 서비스 | Google Gemini API |
| 모델 | `gemini-2.5-flash-image` |
| 기능 | 이미지 생성, 이미지 편집, 시맨틱 마스킹 |
| 인증 | API Key (Header) |

## 2. 엔드포인트

### 2.1 기본 URL

```
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent
```

### 2.2 인증

```
Header: x-goog-api-key: {API_KEY}
```

또는 Query Parameter:
```
?key={API_KEY}
```

## 3. 요청 형식

### 3.1 기본 구조

```json
{
  "contents": [
    {
      "parts": [
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "{BASE64_IMAGE_DATA}"
          }
        },
        {
          "text": "{PROMPT_TEXT}"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
```

### 3.2 다중 이미지 입력 (오브젝트 배치용)

```json
{
  "contents": [
    {
      "parts": [
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "{BASE_IMAGE_BASE64}"
          }
        },
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "{OBJECT_1_BASE64}"
          }
        },
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "{OBJECT_2_BASE64}"
          }
        },
        {
          "text": "{PLACEMENT_PROMPT}"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"]
  }
}
```

## 4. 응답 형식

### 4.1 성공 응답

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "Here is the rendered image..."
          },
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "{RESULT_IMAGE_BASE64}"
            }
          }
        ]
      },
      "finishReason": "STOP"
    }
  ]
}
```

### 4.2 에러 응답

```json
{
  "error": {
    "code": 401,
    "message": "API key not valid. Please pass a valid API key.",
    "status": "UNAUTHENTICATED"
  }
}
```

## 5. Ruby 구현

### 5.1 ApiClient 클래스

```ruby
require 'net/http'
require 'uri'
require 'json'
require 'base64'

module NanoBanana
  class ApiClient
    ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
    TIMEOUT = 60

    def initialize(api_key)
      @api_key = api_key
    end

    # 단일 이미지 + 프롬프트
    def generate(image_base64, prompt)
      body = build_request_body(image_base64, prompt)
      send_request(body)
    end

    # 다중 이미지 + 프롬프트 (오브젝트 배치)
    def generate_with_references(base_image, reference_images, prompt)
      body = build_multi_image_body(base_image, reference_images, prompt)
      send_request(body)
    end

    # API 연결 테스트
    def test_connection
      # 간단한 텍스트 요청으로 테스트
      uri = URI("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image")
      uri.query = "key=#{@api_key}"

      response = Net::HTTP.get_response(uri)
      response.code == "200"
    rescue
      false
    end

    private

    def build_request_body(image_base64, prompt)
      {
        contents: [{
          parts: [
            { inlineData: { mimeType: "image/png", data: image_base64 } },
            { text: prompt }
          ]
        }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      }
    end

    def build_multi_image_body(base_image, reference_images, prompt)
      parts = []

      # 기본 이미지
      parts << { inlineData: { mimeType: "image/png", data: base_image } }

      # 참조 이미지들
      reference_images.each do |ref_image|
        parts << { inlineData: { mimeType: "image/png", data: ref_image } }
      end

      # 프롬프트
      parts << { text: prompt }

      {
        contents: [{ parts: parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      }
    end

    def send_request(body)
      uri = URI(ENDPOINT)
      uri.query = "key=#{@api_key}"

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.read_timeout = TIMEOUT

      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request.body = body.to_json

      response = http.request(request)
      handle_response(response)
    end

    def handle_response(response)
      case response.code.to_i
      when 200
        parse_success_response(response.body)
      when 401
        raise AuthenticationError, "API Key가 유효하지 않습니다."
      when 429
        raise RateLimitError, "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."
      when 500..599
        raise ServerError, "서버 오류가 발생했습니다. (#{response.code})"
      else
        raise ApiError, "알 수 없는 오류: #{response.code} - #{response.body}"
      end
    end

    def parse_success_response(body)
      data = JSON.parse(body)

      candidates = data["candidates"]
      return nil if candidates.nil? || candidates.empty?

      parts = candidates[0]["content"]["parts"]

      result = { text: nil, image: nil }

      parts.each do |part|
        if part["text"]
          result[:text] = part["text"]
        elsif part["inlineData"]
          result[:image] = part["inlineData"]["data"]
        end
      end

      result
    end
  end

  # 커스텀 에러 클래스
  class ApiError < StandardError; end
  class AuthenticationError < ApiError; end
  class RateLimitError < ApiError; end
  class ServerError < ApiError; end
end
```

## 6. 요청 시나리오별 예시

### 6.1 1차 렌더링 (실사화)

```ruby
prompt = <<~PROMPT
  Transform this SketchUp interior rendering into a photorealistic image.

  Keep ALL existing elements exactly unchanged:
  - All walls, floors, ceiling positions and shapes
  - All existing furniture shapes, positions, and materials
  - Original composition and spatial relationships

  Style: Modern interior photography, warm natural lighting
PROMPT

result = api_client.generate(sketchup_image_base64, prompt)
rendered_image = result[:image]
```

### 6.2 낮/밤 전환

```ruby
prompt = <<~PROMPT
  Change the lighting to night time with warm interior lighting.

  Keep ALL existing elements exactly unchanged:
  - All walls, floors, ceiling positions and shapes
  - All existing furniture shapes, positions, and materials
  - Original composition and spatial relationships

  Add warm lamp light and ambient interior glow.
  Windows should show dark night sky.
PROMPT

result = api_client.generate(current_image_base64, prompt)
```

### 6.3 오브젝트 배치 후 재생성

```ruby
prompt = <<~PROMPT
  Using the provided interior image, integrate the additional objects naturally.

  Object placement:
  - Place the floor lamp (second image) at the back-right area of the room,
    approximately 160cm tall, next to the sofa
  - Place the armchair (third image) at the front-left area,
    approximately 90cm tall, facing the center

  Requirements:
  - Each object must match the room's perspective and lighting
  - Objects should cast appropriate shadows
  - Objects should appear naturally integrated

  Keep ALL existing elements exactly unchanged:
  - All walls, floors, ceiling positions and shapes
  - All existing furniture shapes, positions, and materials
PROMPT

result = api_client.generate_with_references(
  base_image,
  [lamp_image, chair_image],
  prompt
)
```

## 7. 에러 처리 전략

### 7.1 재시도 로직

```ruby
def generate_with_retry(image, prompt, max_retries: 3)
  retries = 0

  begin
    generate(image, prompt)
  rescue RateLimitError, ServerError => e
    retries += 1
    if retries <= max_retries
      sleep_time = 2 ** retries  # 지수 백오프: 2, 4, 8초
      sleep(sleep_time)
      retry
    else
      raise e
    end
  end
end
```

### 7.2 타임아웃 처리

```ruby
begin
  result = api_client.generate(image, prompt)
rescue Net::ReadTimeout
  # 사용자에게 알림: "렌더링 시간이 초과되었습니다. 다시 시도하세요."
end
```

## 8. 제한사항

| 항목 | 제한 |
|------|------|
| 최대 이미지 크기 | 20MB (권장: 5MB 이하) |
| 최대 참조 이미지 | 14개 (Gemini 3 Pro 기준) |
| 응답 시간 | 5-30초 (이미지 복잡도에 따라 다름) |
| Rate Limit | 분당 요청 수 제한 (플랜별 상이) |

## 9. 비용 고려사항

- Gemini API는 사용량 기반 과금
- 이미지 생성은 텍스트보다 높은 비용
- 개발/테스트 시 `gemini-2.5-flash-image` 사용 권장 (비용 효율적)
