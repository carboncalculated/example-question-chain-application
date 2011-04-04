# -*- encoding: utf-8 -*-
def green(str); puts "\e[32m#{str}\e[0m"; end
def red(str); puts "\e[33m#{str}\e[0m"; end
def debug(str); puts "\e[35mDEBUG: #{str}\e[0m"; end
namespace :chain_template_contexts do
   desc "Calculator Question Chain Construction Materials"
   task :run => :environment do
          
     c = ChainTemplate.create!(
      :for_resource => "account",
      :context => {
        "flights" => ["4c29b3e0ba5e45a556000001"],
        "materials" => ["4c29a905ba5e45a0c9000001"],
        "fuels" => ["4ca5d0a4ba5e452e22000001"]
      })
      c.activate!
          
   end
end