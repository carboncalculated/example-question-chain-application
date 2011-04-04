# encoding UTF-8
require 'erb'
mongo_config =  ::YAML::load(ERB.new(IO.read("#{Rails.root}/config/mongodb.yml")).result)
MongoMapper.setup(mongo_config, Rails.env, :logger => Rails.logger)