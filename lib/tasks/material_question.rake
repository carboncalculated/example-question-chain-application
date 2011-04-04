# -*- encoding: utf-8 -*-
def green(str); puts "\e[32m#{str}\e[0m"; end
def red(str); puts "\e[33m#{str}\e[0m"; end
def debug(str); puts "\e[35mDEBUG: #{str}\e[0m"; end
namespace :question do
   desc "Question Materials"
   task :material => :environment do
     
    q = Question.create!(
      :calculator_id => "4bab7e4ff78b122cdd000004", 
      :id => "4c29a905ba5e45a0c9000001", 
      :name => "material", 
      :label => "Materials", 
      :description => "To add a Material, choose the material you wish to add, the units you wish to input, then enter a value."
    )
    
    g = q.ui_groups.create!(:name => "first ui group", :label => "material")
    
    g.text_fields.create!(
      :name => "amount_of_material", 
      :label => "Amount", :position => 7,
      :extra_info => "enter the amount in the units you have chosen to the right",
      :css_classes => %w(double col1 large)
      )
    
    units = g.drop_downs.create!(
      :name => "formula_input_name", 
      :label => "Units",
      :populate => "false",
      :position => 8,
      :css_classes => %w(double col2 small),
      :extra_info => "Choose your unit and enter the amount to the left"
      
    )
    
    object_ref = g.object_reference_drop_down.create!(
      :object_name => "material", 
      :name => "material", 
      :label => "Material", 
      :prompt => "Select a material", 
      :populate => false, 
      :drop_down_target_id => units.id.to_s,
      :drop_down_target_options_filters => ["emissions_by_tonne", "emissions_by_kg", "emissions_by_quantity", "emissions_by_m3"],
      :position => 5,
      :attribute_for_display => "label"
    )
    
   object_ref.rules << Rules::PopulateDropDown.new
   object_ref.save!
    
    rc = g.relatable_category_drop_downs.create!(
      :name => "type_of_material", 
      :label => "Material Type", 
      :prompt => "Select material type", 
      :populate => false,
      :drop_down_target_id => object_ref.id.to_s, 
      :position => 4, 
      :object_name => "material", 
      :related_attribute => "material_type",
      :attribute_for_display => "material_type",
      :css_classes => %w(double col2)
      )

    rc2 = g.relatable_category_drop_downs.create!(
      :name => "material_category", 
      :label => "Material Category", 
      :prompt => "Select material category", 
      :drop_down_target_id => rc.id.to_s, 
      :position => 3, 
      :object_name => "material", 
      :extra_info => "start by choosing the top level category for your material",
      :related_attribute => "material_category",
      :attribute_for_display => "material_category",
      :drop_down_target_is_relatable => true,
      :css_classes => %w(double col1)
      )   
         
   end
end