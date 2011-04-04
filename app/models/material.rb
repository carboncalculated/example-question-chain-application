class Material
  include MongoMapper::Document
  include QuestionChain::Answerable
  
  belongs_to :account
  
  def cache_attributes
    # making sure we leave this blanks as it needs a user! this is from Answerable
  end
end