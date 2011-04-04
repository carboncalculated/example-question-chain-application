# -*- encoding: utf-8 -*-
def green(str); puts "\e[32m#{str}\e[0m"; end
def red(str); puts "\e[33m#{str}\e[0m"; end
def debug(str); puts "\e[35mDEBUG: #{str}\e[0m"; end
namespace :question do
   desc "Fuel Question"
   task :fuel => :environment do
    
    q = Question.create!(
      :calculator_id => "4babb4bff78b12431b000001", 
      :id => "4ca5d0a4ba5e452e22000001", 
      :name => "construction fuel", 
      :label => "Fuel", 
      :description => "Select an option below and enter the unit amount"
    )
    
    g = q.ui_groups.create!(:name => "first ui group", :label => "contruction fuel")
    
    g.text_fields.create!(:name => "amount", :label => "Amount", :position => 4, :css_classes => %w(double col1 large))
    
    units = g.drop_downs.create!(
      :name => "formula_input_name", 
      :label => "Units",
      :populate => "false",
      :position => 5,
      :css_classes => %w(double col2 small)
    )
    
    object_ref = g.object_reference_drop_down.create!(
      :object_name => "fuel", 
      :name => "fuel", 
      :label => "Fuel type", 
      :prompt => "Select a fuel type", 
      :populate => true,
      :drop_down_target_id => units.id.to_s,
      :drop_down_target_options_filters => ["per_tonne", "per_net_kwh", "per_litre", 'per_net_therm', 'per_gross_therm', 'per_kwH_grid_rolling_average'],
      :position => 3
    )
    
    object_ref.rules << Rules::PopulateDropDown.new
    object_ref.save!
    
  end
end