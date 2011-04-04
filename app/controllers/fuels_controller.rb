class FuelsController < ApplicationController
  inherit_resources
  actions :index, :show
  belongs_to :account
  
  def begin_of_association_chain
    @account = Account.first_or_create(:name => "account")
  end
end