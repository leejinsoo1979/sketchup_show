# frozen_string_literal: true

require 'openssl'
require 'base64'
require 'json'
require 'fileutils'

module NanoBanana
  # API Key 및 설정 관리 (암호화 저장)
  class ConfigStore
    CONFIG_DIR_NAME = 'NanoBanana'
    CONFIG_FILE_NAME = 'config.enc'
    SALT = 'NanoBanana_2024_Salt_Key'
    CIPHER_ALGORITHM = 'AES-256-CBC'

    def initialize
      @config_dir = determine_config_dir
      @config_path = File.join(@config_dir, CONFIG_FILE_NAME)
      ensure_config_dir
    end

    # API Key 저장
    def save_api_key(api_key)
      config = load_config
      config['api_key'] = api_key
      save_config(config)
    end

    # API Key 로드
    def load_api_key
      config = load_config
      config['api_key']
    end

    # 설정 저장
    def save_setting(key, value)
      config = load_config
      config[key.to_s] = value
      save_config(config)
    end

    # 설정 로드
    def load_setting(key, default = nil)
      config = load_config
      config[key.to_s] || default
    end

    # 모든 설정 로드
    def load_all_settings
      load_config
    end

    # 설정 초기화
    def reset_config
      File.delete(@config_path) if File.exist?(@config_path)
    end

    # 히스토리 저장
    def save_history(entry)
      config = load_config
      config['history'] ||= []
      config['history'].unshift(entry)
      config['history'] = config['history'].first(50) # 최대 50개 유지
      save_config(config)
    end

    # 히스토리 로드
    def load_history
      config = load_config
      config['history'] || []
    end

    private

    # 설정 디렉토리 결정
    def determine_config_dir
      if Sketchup.respond_to?(:temp_dir)
        # SketchUp 환경
        sketchup_support = File.dirname(Sketchup.find_support_file('Plugins'))
        File.join(sketchup_support, CONFIG_DIR_NAME)
      else
        # 테스트 환경
        if RUBY_PLATFORM =~ /darwin/
          File.expand_path("~/Library/Application Support/SketchUp/#{CONFIG_DIR_NAME}")
        elsif RUBY_PLATFORM =~ /mswin|mingw|cygwin/
          File.join(ENV['APPDATA'] || '', 'SketchUp', CONFIG_DIR_NAME)
        else
          File.expand_path("~/.config/sketchup/#{CONFIG_DIR_NAME}")
        end
      end
    end

    # 설정 디렉토리 생성
    def ensure_config_dir
      FileUtils.mkdir_p(@config_dir) unless Dir.exist?(@config_dir)
    end

    # 설정 파일 로드
    def load_config
      return {} unless File.exist?(@config_path)

      begin
        encrypted_data = File.binread(@config_path)
        decrypted_data = decrypt(encrypted_data)
        JSON.parse(decrypted_data)
      rescue StandardError => e
        puts "[NanoBanana] 설정 로드 실패: #{e.message}"
        {}
      end
    end

    # 설정 파일 저장
    def save_config(config)
      begin
        json_data = config.to_json
        encrypted_data = encrypt(json_data)
        File.binwrite(@config_path, encrypted_data)
      rescue StandardError => e
        puts "[NanoBanana] 설정 저장 실패: #{e.message}"
        raise
      end
    end

    # 암호화
    def encrypt(data)
      cipher = OpenSSL::Cipher.new(CIPHER_ALGORITHM)
      cipher.encrypt

      key = generate_key
      iv = cipher.random_iv

      cipher.key = key
      cipher.iv = iv

      encrypted = cipher.update(data) + cipher.final

      # IV와 암호화된 데이터를 함께 저장
      iv + encrypted
    end

    # 복호화
    def decrypt(data)
      cipher = OpenSSL::Cipher.new(CIPHER_ALGORITHM)
      cipher.decrypt

      key = generate_key

      # IV 추출 (첫 16바이트)
      iv = data[0, 16]
      encrypted = data[16..-1]

      cipher.key = key
      cipher.iv = iv

      cipher.update(encrypted) + cipher.final
    end

    # 암호화 키 생성 (머신 고유 정보 기반)
    def generate_key
      machine_id = get_machine_identifier
      OpenSSL::Digest::SHA256.digest(machine_id + SALT)
    end

    # 머신 고유 식별자
    def get_machine_identifier
      if RUBY_PLATFORM =~ /darwin/
        # macOS: 하드웨어 UUID
        result = `ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | grep IOPlatformUUID`
        match = result.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)
        return match[1] if match
      elsif RUBY_PLATFORM =~ /mswin|mingw|cygwin/
        # Windows: 머신 GUID
        begin
          require 'win32/registry'
          Win32::Registry::HKEY_LOCAL_MACHINE.open('SOFTWARE\Microsoft\Cryptography') do |reg|
            return reg['MachineGuid']
          end
        rescue StandardError
          # 대체: 컴퓨터 이름 + 사용자 이름
        end
      end

      # 대체: 환경 정보 조합
      "#{Socket.gethostname rescue 'unknown'}_#{ENV['USER'] || ENV['USERNAME'] || 'user'}"
    end
  end
end
