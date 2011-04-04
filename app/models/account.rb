class Account
  include MongoMapper::Document
  
  # == Keys
  key :name, String
  
  # == Associations
  many :flights
  many :fuels
  many :materials
end