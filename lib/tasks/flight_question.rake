# -*- encoding: utf-8 -*-
def green(str); puts "\e[32m#{str}\e[0m"; end
def red(str); puts "\e[33m#{str}\e[0m"; end
def debug(str); puts "\e[35mDEBUG: #{str}\e[0m"; end
namespace :question do
   desc "Question For A Flight Calculator"
   
   task :flight => :environment do
     
    q = Question.create!(
      :calculator_id => "4bab7e17f78b122cdd000001", 
      :id => "4c29b3e0ba5e45a556000001", 
      :name => "transport", 
      :label => "Commuting", 
      :description => "Select from the options below and enter the distance"
    )
    
    g = q.ui_groups.create!(:name => "first ui group", :label => "flight")
    
    no_of_journys = g.text_fields.create!(
      :name => "no_of_journeys", 
      :label => "Number of journeys", 
      :position => 4,
      :css_classes => %w(double col1),
      :default_value => 1
     )
    no_of_people = g.drop_downs.create!(
      :name => "no_of_people", 
      :label => "Number Of People", 
      :position => 5,
      :options => 10.times.map{|i| {:value => i+1, :name => (i+1).to_s}},
      :css_classes => %w(double col2)
      )
    
    
    origin = g.object_searches.create!(
      :name => "origin", 
      :object_name => "airport", 
      :label => "Origin Airport",
      :prompt => "Enter Origin",
      :position => 1,
      :ui_attributes => {:disable => true},
      :extra_info => "Enter Either the iata code or the country or airports name"
    )
          
    desintation = g.object_searches.create!(
      :name => :destination, 
      :object_name => "airport", 
      :label => "Destination Airport",
      :prompt => "Enter Destination", 
      :position => 2,
      :extra_info => "Enter Either the iata code or the country or airports name",
      :ui_attributes => {:disable => true}
    )
    
    object_ref = g.object_reference_drop_down.create!(
      :object_name => "transport", 
      :name => "transport", 
      :label => "Vehicle", 
      :prompt => "Select a flight type", 
      :filter_attribute => "transport_type",
      :filter_value => "plane",
      :populate => true,
      :position => 3,
      :css_classes => %w(single)
    )
      
   end
end