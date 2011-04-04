class FlightsController < ApplicationController
  inherit_resources
  actions :index, :show
  belongs_to :account

end