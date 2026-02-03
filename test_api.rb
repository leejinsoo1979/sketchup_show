# API 테스트 스크립트
require 'net/http'
require 'uri'

key = NanoBanana.instance_variable_get(:@config_store).load_api_key
url = "https://generativelanguage.googleapis.com/v1beta/models?key=#{key}"
uri = URI(url)
response = Net::HTTP.get_response(uri)
puts "Code: #{response.code}"
puts response.body[0..500]
