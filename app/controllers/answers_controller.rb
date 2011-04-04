class AnswersController < ApplicationController
  inherit_resources
  
  # == Notice here we are doing a belongs to using inherited resources
  # this will then be used in the chain_template class to find the right 
  # context ie fuels or materials
  
  belongs_to :account
  include QuestionChain::Answers
  
  # current user is required by default this is just me overriding it
  def current_user
    Hashie::Mash.new(:id => 1)
  end
        
  private
  # truly not cool include still does not take care of this 
  # probably due to the fact
  def collection_path
    polymorphic_path(@contexts[0..-1] << @context.to_sym)
  end
    
  # ok this is bad but for the minute ajax request from the QuestionChainLib are not 
  # sending the authentication tokes
  def handle_unverified_request
    unless action_name == "fire_object_search" || action_name == "fire_populate_drop_down" 
      super
    end
  end
  
  def begin_of_association_chain
    @account = Account.first_or_create(:name => "account")
  end
end

