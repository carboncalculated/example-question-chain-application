module ExampleQuestionChainApplication
  def self.[](key)
    unless @config
      raw_config = File.read(File.join(File.dirname(__FILE__), "../../config", "example_application.yml"))
      @config = YAML.load(raw_config)[Rails.env].symbolize_keys
    end
    @config[key]
  end
  
  def self.[]=(key, value)
    @config[key.to_sym] = value
  end
  
  # use the example_application to set the API KEY for you
  #
  # ExampleQuestionChainApplication[:api_key] instead of ENV[:api_key]
  def self.calculated_session
    @session ||= Calculated::Session.create(:server => ExampleQuestionChainApplication[:api_server], :api_key => ENV["CC_API_KEY"])
  end
end


