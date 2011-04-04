ExampleQuestionChainApplication::Application.routes.draw do
    
    # == Have yet to create a Routing helper from question Chain
    # Hence manua here and this is about is obvious well its just not
    match '/answers/fire_object_search' => 'answers#fire_object_search'
    match '/answers/fire_populate_drop_down' => 'answers#fire_populate_drop_down'

    chain_template_routes = lambda do
      scope "/:context(/:question_id)" do
        resources :answers, :only => [:new, :create, :index] do
          collection do
             post :fire_populate_drop_down
             post :fire_object_search
           end
        end
      end

      scope "/:context" do
        resources :answers, :only => [:edit, :update, :show] do
          collection do
             post :fire_populate_drop_down
             post :fire_object_search
           end
        end
      end
    end
    
    resources :accounts do
      chain_template_routes.call
      resources :materials, :only => [:show, :index]
      resources :fuels, :only => [:show, :index]
      resources :flights, :only => [:show, :index]
    end
 
    
  root :to => "home#index"

  # See how all your routes lay out with "rake routes"

  # This is a legacy wild controller route that's not recommended for RESTful applications.
  # Note: This route will make all actions in every controller accessible via GET requests.
  # match ':controller(/:action(/:id(.:format)))'
end
