window.addEvent('domready', function() {
	if (typeof QuestionChain != "undefined"){
		question_chain = new QuestionChain(questionBundle);
	};
	
	if($$('.tooltip')[0]){
		$$('.tooltip').each(function(el){
			el.store('tip:text', el.getElement('.description').get('html'));
		}); 
		var toolTips = new Tips($$('.tooltip'),{
			showDelay: 0,
			hideDelay: 0,
			fixed: true,
			onShow: function(toolTipElement){
				toolTipElement.fade(1);
			},
			onHide: function(toolTipElement){
				toolTipElement.fade(0);
			}
		});
	}
});
