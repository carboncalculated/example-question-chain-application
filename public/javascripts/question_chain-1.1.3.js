/*  QuestionChain JavaScript library, version 1.1.3
 *  (c) 2010 CarbonCalculated Richard Hooker
 *
 */
/*
---

description: A plugin for enabling autocomplete of a text input or textarea.

authors:
 - Fábio Miranda Costa

requires:
 - core/1.2.4: [Class.Extras, Element.Event, Element.Style]
 - more/1.2.3.1: Element.Forms

license: MIT-style license

provides: [Meio.Autocomplete]

...
*/

(function(global){

	var $ = global.document.id || global.$;
	var browserEngine = Browser.Engine; // better compression and faster


	$extend(Element.NativeEvents, {
		'paste': 2, 'input': 2
	});
	Element.Events.paste = {
		base : (browserEngine.presto || (browserEngine.gecko && browserEngine.version < 19)) ? 'input' : 'paste',
		condition: function(e){
			this.fireEvent('paste', e, 1);
			return false;
		}
	};

	Element.Events.keyrepeat = {
		base : (browserEngine.gecko || browserEngine.presto) ? 'keypress' : 'keydown',
		condition: $lambda(true)
	};


	var Meio = {};
	var globalCache;

	var keysThatDontChangeValueOnKeyUp = {
		9:   1,  // tab
		16:  1,  // shift
		17:  1,  // control
		18:  1,  // alt
		224: 1,  // command (meta onkeypress)
		91:  1,  // command (meta onkeydown)
		37:  1,  // left
		38:  1,  // up
		39:  1,  // right
		40:  1   // down
	};

	var encode = function(str){
		return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	};


	Meio.Widget = new Class({

		initialize: function(){
			this.elements = {};
		},

		addElement: function(name, obj){
			this.elements[name] = obj;
		},

		addEventToElement: function(name, eventName, event){
			this.elements[name].addEvent(eventName, event.bindWithEvent(this));
		},

		addEventsToElement: function(name, events){
			for(eventName in events){
				this.addEventToElement(name, eventName, events[eventName]);
			};
		},

		attach: function(){
			for(element in this.elements){
				this.elements[element].attach();
			}
		},

		detach: function(){
			for(element in this.elements){
				this.elements[element].detach();
			}
		},

		destroy: function(){
			for(element in this.elements){
				this.elements[element] && this.elements[element].destroy();
			}
		}
	});

	Meio.Autocomplete = new Class({

		Extends: Meio.Widget,

		Implements: [Options, Events],

		options: {

			delay: 200,
			minChars: 0,
			cacheLength: 20,
			selectOnTab: true,
			maxVisibleItems: 10,
			cacheType: 'shared', // 'shared' or 'own'

			filter: {
				/*
					its posible to pass the filters directly or by passing a type and optionaly a path.

					filter: function(text, data){}
					formatMatch: function(text, data, i){}
					formatItem: function(text, data){}

					or

					type: 'startswith' or 'contains' // can be any defined on the Meio.Autocomplete.Filter object
					path: 'a.b.c' // path to the text value on each object thats contained on the data array
				*/
			},

			/*
			onNoItemToList: function(elements){},
			onSelect: function(elements, value){},
			onDeselect: function(elements){},
			*/

			fieldOptions: {}, // see Element options
			listOptions: {}, // see List options
			requestOptions: {}, // see DataRequest options
			urlOptions: {} // see URL options

		},

		initialize: function(input, data, options, listInstance){
			this.parent();
			this.setOptions(options);
			this.active = 0;

			this.filters = Meio.Autocomplete.Filter.get(this.options.filter);

			this.addElement('list', listInstance || new Meio.Element.List(this.options.listOptions));
			this.addListEvents();

			this.addElement('field', new Meio.Element.Field(input, this.options.fieldOptions));
			this.addFieldEvents();

			this.addSelectEvents();

			this.attach();
			this.initCache();
			this.initData(data);
		},

		addFieldEvents: function(){
			this.addEventsToElement('field', {
				'beforeKeyrepeat': function(e){
					this.active = 1;
					var e_key = e.key, list = this.elements.list;
					if(e_key == 'up' || e_key == 'down' || (e_key == 'enter' && list.showing)) e.preventDefault();
				},
				'delayedKeyrepeat': function(e){
					var e_key = e.key, field = this.elements.field;
					field.keyPressControl[e_key] = true;
					switch(e_key){
					case 'up': case 'down':
						this.focusItem(e_key);
						break;
					case 'enter':
						this.setInputValue();
						break;
					case 'tab':
						if(this.options.selectOnTab) this.setInputValue();
						field.keyPressControl[e_key] = false; // tab blurs the input so the keyup event wont happen at the same input you made a keydown
						break;
					case 'esc':
						this.elements.list.hide();
						break;
					default:
						this.setupList();
					}
					this.oldInputedText = field.node.get('value');
				},
				'keyup': function(e){
					var field = this.elements.field;
					if(!keysThatDontChangeValueOnKeyUp[e.code]){
						if(!field.keyPressControl[e.key]) this.setupList();
						field.keyPressControl[e.key] = false;
					}
				},
				'focus': function(){
					this.active = 1;
					var list = this.elements.list;
					list.focusedItem = null;
					list.positionNextTo(this.elements.field.node);
				},
				'click': function(){
					if(this.active++ > 1 && !this.elements.list.showing){
						this.forceSetupList();
					}
				},
				'blur': function(e){
					this.active = 0;
					var list = this.elements.list;
					if(list.shouldNotBlur){
						this.elements.field.node.setCaretPosition('end');
						list.shouldNotBlur = false;
						if(list.focusedItem) list.hide();
					}else{
						list.hide();
					}
				},
				'paste': function(){
					return this.setupList();
				}
			});
		},

		addListEvents: function(){
			this.addEventsToElement('list', {
				'mousedown': function(e){
					if(this.active && !e.dontHide) this.setInputValue();
				}
			});
		},

		update: function(){
			var text = this.inputedText, data = this.data, options = this.options, list = this.elements.list;
			var filter = this.filters.filter, formatMatch = this.filters.formatMatch, formatItem = this.filters.formatItem;
			var cacheKey = data.getKey(), cached = this.cache.get(cacheKey), html;
			if(cached){
				html = cached.html;
				this.itemsData = cached.data;
			}else{
				data = data.get();
				var itemsHtml = [], itemsData = [], classes = list.options.classes;
				for(var row, i = 0, n = 0; row = data[i++];){
					if(filter.call(this, text, row)){
						itemsHtml.push(
							'<li title="', encode(formatMatch.call(this, text, row)),
							'" data-index="', n,
							'" class="', (n%2 ? classes.even : classes.odd), '">',
							formatItem.call(this, text, row, n),
							'</li>'
						);
						itemsData.push(row);
						n++;
					}
				}
				html = itemsHtml.join('');
				this.cache.set(cacheKey, {html: html, data: itemsData});
				this.itemsData = itemsData;
			}
			list.focusedItem = null;
			this.fireEvent('deselect', [this.elements]);
			list.list.set('html', html);
			if(this.options.maxVisibleItems) list.applyMaxHeight(this.options.maxVisibleItems);
		},

		setupList: function(){
			this.inputedText = this.elements.field.node.get('value');
			if(this.inputedText !== this.oldInputedText){
				this.forceSetupList(this.inputedText);
			}else{
				this.elements.list.hide();
			}
			return true;
		},

		forceSetupList: function(inputedText){
			inputedText = inputedText || this.elements.field.node.get('value');
			if(inputedText.length >= this.options.minChars){
				$clear(this.prepareTimer);
				this.prepareTimer = this.data.prepare.delay(this.options.delay, this.data, this.inputedText);
			}
		},

		dataReady: function(){
			this.update();
			if(this.onUpdate){
				this.onUpdate();
				this.onUpdate = null;
			}
			var list = this.elements.list;
			if(list.list.get('html')){
				if(this.active) list.show();
			}else{
				this.fireEvent('noItemToList', [this.elements]);
				list.hide();
			}
		},

		setInputValue: function(){
			var list = this.elements.list;
			if(list.focusedItem){
				var text = list.focusedItem.get('title');
				this.elements.field.node.set('value', text);
				var index = list.focusedItem.get('data-index');
				this.fireEvent('select', [this.elements, this.itemsData[index], text, index]);
			}
			list.hide();
		},

		focusItem: function(direction){
			var list = this.elements.list;
			if(list.showing){
				list.focusItem(direction);
			}else{
				this.forceSetupList();
				this.onUpdate = function(){ list.focusItem(direction); };
			}
		},

		addSelectEvents: function(){
			this.addEvents({
				select: function(elements){
					elements.field.addSelectedClass();
				},
				deselect: function(elements){
					elements.field.removeSelectedClass();
				}
			});
		},

		initData: function(data){
			this.data = ($type(data) == 'string') ?
				new Meio.Autocomplete.Data.Request(data, this.cache, this.elements.field, this.options.requestOptions, this.options.urlOptions) :
				new Meio.Autocomplete.Data(data, this.cache);
			this.data.addEvent('ready', this.dataReady.bind(this));
		},

		initCache: function(){
			var cacheLength = this.options.cacheLength;
			if(this.options.cacheType == 'shared'){
				this.cache = globalCache;
				this.cache.setMaxLength(cacheLength);
			}else{ // 'own'
				this.cache = new Meio.Autocomplete.Cache(cacheLength);
			}
		},

		refreshCache: function(cacheLength){
			this.cache.refresh();
			this.cache.setMaxLength(cacheLength || this.options.cacheLength);
		},

		refreshAll: function(cacheLength, urlOptions){
			this.refreshCache(cacheLength);
			this.data.refreshKey(urlOptions);
		}

	});


	Meio.Autocomplete.Select = new Class({

		Extends: Meio.Autocomplete,

		options: {
			syncName: 'id', // if falsy it wont sync at start
			valueField: null,
			valueFilter: function(data){
				return data.id;
			}
		},

		initialize: function(input, data, options, listInstance){
			this.parent(input, data, options, listInstance);
			this.valueField = $(this.options.valueField);

			if(!this.valueField) return;

			if(this.options.syncName){
				this.syncWithValueField(data);
			}

			this.addValueFieldEvents();
		},

		addValueFieldEvents: function(){
			this.addEvents({
				'select': function(elements, data){
					this.valueField.set('value', this.options.valueFilter.call(this, data));
				},
				'deselect': function(elements){
					this.valueField.set('value', '');
				}
			});
		},

		syncWithValueField: function(data){
			var value = this.getValueFromValueField();

			if(!value) return;

			this.addParameter(data);
			this.addDataReadyEvent(value);

			this.data.prepare(this.elements.field.node.get('value'));
		},

		addParameter: function(data){
			this.parameter = {
				name: this.options.syncName,
				value: function(){ return this.valueField.value; }.bind(this)
			};
			if(this.data.url) this.data.url.addParameter(this.parameter);
		},

		addDataReadyEvent: function(value){
			var self = this;
			this.data.addEvent('ready', function runOnce(){
				var values = this.get();
				for(var i = values.length; i--;){
					if(self.options.valueFilter.call(self, values[i]) == value){
						self.elements.field.node.set('value', self.filters.formatMatch.call(self, '', values[i], 0));
					}
				}
				if(this.url) this.url.removeParameter(self.parameter);
				this.removeEvent('ready', runOnce);
			});
		},

		getValueFromValueField: function(){
			return this.valueField.get('value');
		}

	});


	Meio.Autocomplete.Select.One = new Class({

		Extends: Meio.Autocomplete.Select,

		options: {
			filter: {
				path: 'text' // path to the text value on each object thats contained on the data array
			}
		},

		initialize: function(select, options, listInstance){
			this.select = $(select);
			this.replaceSelect();
			this.parent(this.field, this.createDataArray(), $merge(options, {
				valueField: this.select,
				valueFilter: function(data){ return data.value; }
			}), listInstance);
		},

		replaceSelect: function(){
			var selectedOption = this.select.getSelected()[0];
			this.field = new Element('input', {type: 'text'});
			var optionValue = selectedOption.get('value');
			if($chk(optionValue)) this.field.set('value', selectedOption.get('html'));
			this.select.setStyle('display', 'none');
			this.field.inject(this.select, 'after');
		},

		createDataArray: function(){
			var selectOptions = this.select.options, data = [];
			for(var i = 0, selectOption, optionValue; selectOption = selectOptions[i++];){
				optionValue = selectOption.value;
				if($chk(optionValue)) data.push({value: optionValue, text: selectOption.innerHTML});
			}
			return data;
		},

		addValueFieldEvents: function(){
			this.addEvents({
				'select': function(elements, data, text, index){
					var option = this.valueField.getElement('option[value="' + this.options.valueFilter.call(this, data) + '"]');
					if(option) option.selected = true;
				},
				'deselect': function(elements){
					var option = this.valueField.getSelected()[0];
					if(option) option.selected = false;
				}
			});
		},

		getValueFromValueField: function(){
			return this.valueField.getSelected()[0].get('value');
		}

	});

	Meio.Element = new Class({

		Implements: [Events],

		initialize: function(node){
			this.setNode(node);
			this.createBoundEvents();
			this.attach();
		},

		setNode: function(node){
			this.node = node ? $(node) || $$(node)[0] : this.render();
		},

		createBoundEvents: function(){
			this.bound = {};
			this.boundEvents.each(function(evt){
				this.bound[evt] = function(e){
					this.fireEvent('before' + evt.capitalize(), e);
					this[evt] && this[evt](e);
					this.fireEvent(evt, e);
					return true;
				}.bindWithEvent(this);
			}, this);
		},

		attach: function(){
			for(e in this.bound){
				this.node.addEvent(e, this.bound[e]);
			}
		},

		detach: function(){
			for(e in this.bound){
				this.node.removeEvent(e, this.bound[e]);
			}
		},

		toElement: function(){
			this.node;
		},

		render: $empty

	});

	Meio.Element.Field = new Class({

		Extends: Meio.Element,

		Implements: [Options],

		options: {
			classes: {
				loading: 'ma-loading',
				selected: 'ma-selected'
			}
		},

		initialize: function(field, options){
			this.keyPressControl = {};
			this.boundEvents = ['paste', 'focus', 'blur', 'click', 'keyup', 'keyrepeat'];
			if(browserEngine.trident4) this.boundEvents.push('keypress'); // yeah super ugly, but what can be awesome with ie?
			this.setOptions(options);
			this.parent(field);

			$(global).addEvent('unload', function(){
				if(this.node) this.node.set('autocomplete', 'on'); // if autocomplete is off when you reload the page the input value gets erased
			}.bind(this));
		},

		setNode: function(element){
			this.parent(element);
			this.node.set('autocomplete', 'off');
		},

		keyrepeat: function(e){
			$clear(this.keyrepeatTimer);
			this.keyrepeatTimer = this._keyrepeat.delay(1, this, e);
		},

		_keyrepeat: function(e){
			this.fireEvent('delayedKeyrepeat', e);
		},

		destroy: function(){
			this.detach();
			this.node.removeAttribute('autocomplete');
		},

		addLoadingClass: function(){
			$(this.node.parentNode).addClass(this.options.classes.loading);
		},

		removeLoadingClass: function(){
			$(this.node.parentNode).removeClass(this.options.classes.loading);
		},

		addSelectedClass: function(){
			$(this.node.parentNode).addClass(this.options.classes.selected);
		},

		removeSelectedClass: function(){
			$(this.node.parentNode).removeClass(this.options.classes.selected);
		},

		keypress: function(e){
			if(e.key == 'enter') this.bound.keyrepeat(e);
		}

	});

	Meio.Element.List = new Class({

		Extends: Meio.Element,

		Implements: [Options],

		options: {
			width: 'field', // you can pass any other value settable by set('width') to the list container
			classes: {
				container: 'ma-container',
				hover: 'ma-hover',
				odd: 'ma-odd',
				even: 'ma-even'
			}
		},

		initialize: function(options){
			this.boundEvents = ['mousedown', 'mouseover'];
			this.setOptions(options);
			this.parent();
			this.focusedItem = null;
		},

		applyMaxHeight: function(maxVisibleItems){
			var listChildren = this.list.childNodes;
			var node = listChildren[maxVisibleItems - 1] || (listChildren.length ? listChildren[listChildren.length - 1] : null);
			if(!node) return;
			node = $(node);
			for(var i = 2; i--;) this.node.setStyle('height', node.getCoordinates(this.list).bottom);
		},

		mouseover: function(e){
			var item = this.getItemFromEvent(e), hoverClass = this.options.classes.hover;
			if(!item) return true;
			if(this.focusedItem) this.focusedItem.removeClass(hoverClass);
			item.addClass(hoverClass);
			this.focusedItem = item;
			this.fireEvent('focusItem', [this.focusedItem]);
		},

		mousedown: function(e){
			e.preventDefault();
			this.shouldNotBlur = true;
			if(!(this.focusedItem = this.getItemFromEvent(e))){
				e.dontHide = true;
				return true;
			}
			this.focusedItem.removeClass(this.options.classes.hover);
		},

		focusItem: function(direction){
			var hoverClass = this.options.classes.hover, newFocusedItem;
			if(this.focusedItem){
				if((newFocusedItem = this.focusedItem[direction == 'up' ? 'getPrevious' : 'getNext']())){
					this.focusedItem.removeClass(hoverClass);
					newFocusedItem.addClass(hoverClass);
					this.focusedItem = newFocusedItem;
					this.scrollFocusedItem(direction);
				}
			}
			else{
				if((newFocusedItem = this.list.getFirst())){
					newFocusedItem.addClass(hoverClass);
					this.focusedItem = newFocusedItem;
				}
			}
		},

		scrollFocusedItem: function(direction){
			var focusedItemCoordinates = this.focusedItem.getCoordinates(this.list),
				scrollTop = this.node.scrollTop;
			if(direction == 'down'){
				var delta = focusedItemCoordinates.bottom - this.node.getStyle('height').toInt();
				if((delta - scrollTop) > 0){
					this.node.scrollTop = delta;
				}
			}else{
				var top = focusedItemCoordinates.top;
				if(scrollTop && scrollTop > top){
					this.node.scrollTop = top;
				}
			}
		},

		getItemFromEvent: function(e){
			var target = e.target;
			while(target && target.tagName != 'LI'){
				if(target === this.node) return null;
				target = target.parentNode;
			}
			return $(target);
		},

		render: function(){
			var node = new Element('div', {'class': this.options.classes.container});
			if(node.bgiframe) node.bgiframe({top: 0, left: 0});
			this.list = new Element('ul').inject(node);
			$(document.body).grab(node);
			return node;
		},

		positionNextTo: function(fieldNode){
			var width = this.options.width, listNode = this.node;
			var elPosition = fieldNode.getCoordinates();
			listNode.setStyle('width', width == 'field' ? fieldNode.getWidth().toInt() - listNode.getStyle('border-left-width').toInt() - listNode.getStyle('border-right-width').toInt() : width);
			listNode.setPosition({x: elPosition.left, y: elPosition.bottom});
		},

		show: function(){
			this.node.scrollTop = 0;
			this.node.setStyle('visibility', 'visible');
			this.showing = true;
		},

		hide: function(){
			this.showing = false;
			this.node.setStyle('visibility', 'hidden');
		}

	});

	Meio.Autocomplete.Filter = {

		filters: {},

		get: function(options){
			var type = options.type, keys = (options.path || '').split('.');
			var filters = (type && this.filters[type]) ? this.filters[type](this, keys) : options;
			return $merge(this.defaults(keys), filters);
		},

		define: function(name, options){
			this.filters[name] = options;
		},

		defaults: function(keys){
			var self = this;
			return {
				filter: function(text, data){
					var regexp = text.escapeRegExp().split(" ").map(function(el){
						return "(" + el + ")"
					}).join("|")
					return text ? self._getValueFromKeys(data, keys).test(new RegExp(regexp, 'i')) : true;
				},
				formatMatch: function(text, data){
					return self._getValueFromKeys(data, keys);
				},
				formatItem: function(text, data, i){
					return text ? self._getValueFromKeys(data, keys).replace(new RegExp('(' + text.escapeRegExp() + ')', 'gi'), '<strong>$1</strong>') : self._getValueFromKeys(data, keys);
				}
			};
		},

		_getValueFromKeys: function(obj, keys){
			var key, value = obj;
			for(var i = 0; key = keys[i++];) value = value[key];
			return value;
		}

	};

	Meio.Autocomplete.Filter.define('contains', function(self, keys){return {};});
	Meio.Autocomplete.Filter.define('startswith', function(self, keys){
		return {
			filter: function(text, data){
				return text ? self._getValueFromKeys(data, keys).test(new RegExp('^' + text.escapeRegExp(), 'i')) : true;
			}
		};
	});

	Meio.Autocomplete.Data = new Class({

		Implements: [Options, Events],

		initialize: function(data, cache){
			this._cache = cache;
			this.data = data;
			this.dataString = JSON.encode(this.data);
		},

		get: function(){
			return this.data;
		},

		getKey: function(){
			return this.cachedKey;
		},

		prepare: function(text){
			this.cachedKey = this.dataString + (text || '');
			this.fireEvent('ready');
		},

		cache: function(key, data){
			this._cache.set(key, data);
		},

		refreshKey: $empty

	});

	Meio.Autocomplete.Data.Request = new Class({

		Extends: Meio.Autocomplete.Data,

		options: {
			noCache: true
		},

		initialize: function(url, cache, element, options, urlOptions){
			this.setOptions(options);
			this.rawUrl = url;
			this._cache = cache;
			this.element = element;
			this.urlOptions = urlOptions;
			this.refreshKey();
			this.createRequest();
		},

		prepare: function(text){
			this.cachedKey = this.url.evaluate(text);
			if(this._cache.has(this.cachedKey)){
				this.fireEvent('ready');
			}else{
				this.request.send({url: this.cachedKey});
			}
		},

		createRequest: function(){
			var self = this;
			this.request = new Request.JSON(this.options);
			this.request.addEvents({
				request: function(){
					self.element.addLoadingClass();
				},
				complete: function(){
					self.element.removeLoadingClass();
				},
				success: function(jsonResponse){
					self.data = jsonResponse.options;
					self.fireEvent('ready');
				}
			});
		},

		refreshKey: function(urlOptions){
			urlOptions = $merge(this.urlOptions, {url: this.rawUrl}, urlOptions || {});
			this.url = new Meio.Autocomplete.Data.Request.URL(urlOptions.url, urlOptions);
		}

	});

	Meio.Autocomplete.Data.Request.URL = new Class({

		Implements: [Options],

		options: {
			extraParams: null,
			max: 20
		},

		initialize: function(url, options){
			this.setOptions(options);
			this.rawUrl = url;
			this.url = url;
			this.url += this.url.contains('?') ? '&' : '?';
			this.dynamicExtraParams = [];
			var params = $splat(this.options.extraParams);
			for(var i = params.length; i--;){
				this.addParameter(params[i]);
			}
			if(this.options.max) this.addParameter('limit=' + this.options.max);
		},

		evaluate: function(text){
			text = text || '';
			var params = this.dynamicExtraParams, url = [];
			url.push('q=' + encodeURIComponent(text));
			for(var i = params.length; i--;){
				url.push(encodeURIComponent(params[i].name) + '=' + encodeURIComponent($lambda(params[i].value)()));
			}
			return this.url + url.join('&');
		},

		addParameter: function(param){
			if(isFinite(param.nodeType) || $type(param.value) == 'function'){
				this.dynamicExtraParams.push(param);
			}else{
				this.url += (($type(param) == 'string') ? param : encodeURIComponent(param.name) + '=' + encodeURIComponent(param.value)) + '&';
			}
		},

		removeParameter: function(param){
			this.dynamicExtraParams.erase(param);
		}

	});

	Meio.Autocomplete.Cache = new Class({

		initialize: function(maxLength){
			this.refresh();
			this.setMaxLength(maxLength);
		},

		set: function(key, value){
			if(!this.cache[key]){
				if(this.getLength() >= this.maxLength){
					var keyToRemove = this.pos.shift();
					this.cache[keyToRemove] = null;
					delete this.cache[keyToRemove];
				}
				this.cache[key] = value;
				this.pos.push(key);
			}
			return this;
		},

		get: function(key){
			return this.cache[key || ''] || null;
		},

		has: function(key){
			return !!this.get(key);
		},

		getLength: function(){
			return this.pos.length;
		},

		refresh: function(){
			this.cache = {};
			this.pos = [];
		},

		setMaxLength: function(maxLength){
			this.maxLength = Math.max(maxLength, 1);
		}

	});

	globalCache = new Meio.Autocomplete.Cache();

	if($defined(global.Meio)) $extend(global.Meio, Meio);
	else global.Meio = Meio;

})(this);
/*
  Shamless port of http://github.com/defunkt/mustache
  by Jan Lehnardt <jan@apache.org>,
     Alexander Lang <alex@upstream-berlin.com>,
     Sebastian Cohnen <sebastian.cohnen@googlemail.com>

  Thanks @defunkt for the awesome code.

  See http://github.com/defunkt/mustache for more info.
*/

var Mustache = function() {
  var Renderer = function() {};

  Renderer.prototype = {
    otag: "{{",
    ctag: "}}",
    pragmas: {},
    buffer: [],

    render: function(template, context, partials, in_recursion) {
      if(template.indexOf(this.otag) == -1) {
        if(in_recursion) {
          return template;
        } else {
          this.send(template);
        }
      }

      if(!in_recursion) {
        this.buffer = [];
      }

      template = this.render_pragmas(template);
      var html = this.render_section(template, context, partials);
      if(in_recursion) {
        return this.render_tags(html, context, partials, in_recursion);
      }

      this.render_tags(html, context, partials, in_recursion);
    },

    /*
      Sends parsed lines
    */
    send: function(line) {
      if(line != "") {
        this.buffer.push(line);
      }
    },

    /*
      Looks for %PRAGMAS
    */
    render_pragmas: function(template) {
      if(template.indexOf(this.otag + "%") == -1) {
        return template;
      }

      var that = this;
      var regex = new RegExp(this.otag + "%([\\w_-]+) ?([\\w]+=[\\w]+)?"
        + this.ctag);
      return template.replace(regex, function(match, pragma, options) {
        that.pragmas[pragma] = {};
        if(options) {
          var opts = options.split("=");
          that.pragmas[pragma][opts[0]] = opts[1];
        }
        return "";
      });
    },

    /*
      Tries to find a partial in the global scope and render it
    */
    render_partial: function(name, context, partials) {
      if(typeof(context[name]) != "object") {
        throw({message: "subcontext for '" + name + "' is not an object"});
      }
      if(!partials || !partials[name]) {
        throw({message: "unknown_partial"});
      }
      return this.render(partials[name], context[name], partials, true);
    },

    /*
      Renders boolean and enumerable sections
    */
    render_section: function(template, context, partials) {
      if(template.indexOf(this.otag + "#") == -1) {
        return template;
      }
      var that = this;
      var regex = new RegExp(this.otag + "\\#(.+)" + this.ctag +
              "\\s*([\\s\\S]+?)" + this.otag + "\\/\\1" + this.ctag + "\\s*", "mg");

      return template.replace(regex, function(match, name, content) {
        var value = that.find(name, context);
        if(that.is_array(value)) { // Enumerable, Let's loop!
          return that.map(value, function(row) {
            return that.render(content, that.merge(context,
                    that.create_context(row)), partials, true);
          }).join("");
        } else if(value) { // boolean section
          return that.render(content, context, partials, true);
        } else {
          return "";
        }
      });
    },

    /*
      Replace {{foo}} and friends with values from our view
    */
    render_tags: function(template, context, partials, in_recursion) {
      var that = this;

      var new_regex = function() {
        return new RegExp(that.otag + "(=|!|>|\\{|%)?([^\/#]+?)\\1?" +
          that.ctag + "+", "g");
      };

      var regex = new_regex();
      var lines = template.split("\n");
       for (var i=0; i < lines.length; i++) {
         lines[i] = lines[i].replace(regex, function(match, operator, name) {
           switch(operator) {
             case "!": // ignore comments
               return match;
             case "=": // set new delimiters, rebuild the replace regexp
               that.set_delimiters(name);
               regex = new_regex();
               return "";
             case ">": // render partial
               return that.render_partial(name, context, partials);
             case "{": // the triple mustache is unescaped
               return that.find(name, context);
             default: // escape the value
               return that.escape(that.find(name, context));
           }
         }, this);
         if(!in_recursion) {
           this.send(lines[i]);
         }
       }
       return lines.join("\n");
    },

    set_delimiters: function(delimiters) {
      var dels = delimiters.split(" ");
      this.otag = this.escape_regex(dels[0]);
      this.ctag = this.escape_regex(dels[1]);
    },

    escape_regex: function(text) {
      if(!arguments.callee.sRE) {
        var specials = [
          '/', '.', '*', '+', '?', '|',
          '(', ')', '[', ']', '{', '}', '\\'
        ];
        arguments.callee.sRE = new RegExp(
          '(\\' + specials.join('|\\') + ')', 'g'
        );
      }
    return text.replace(arguments.callee.sRE, '\\$1');
    },

    /*
      find `name` in current `context`. That is find me a value
      from the view object
    */
    find: function(name, context) {
      name = this.trim(name);
      if(typeof context[name] === "function") {
        return context[name].apply(context);
      }
      if(context[name] !== undefined) {
        return context[name];
      }
      return "";
    },


    /*
      Does away with nasty characters
    */
    escape: function(s) {
      return s.toString().replace(/[&"<>\\]/g, function(s) {
        switch(s) {
          case "&": return "&amp;";
          case "\\": return "\\\\";;
          case '"': return '\"';;
          case "<": return "&lt;";
          case ">": return "&gt;";
          default: return s;
        }
      });
    },

    /*
      Merges all properties of object `b` into object `a`.
      `b.property` overwrites a.property`
    */
    merge: function(a, b) {
      var _new = {};
      for(var name in a) {
        if(a.hasOwnProperty(name)) {
          _new[name] = a[name];
        }
      };
      for(var name in b) {
        if(b.hasOwnProperty(name)) {
          _new[name] = b[name];
        }
      };
      return _new;
    },

    create_context: function(_context) {
      if(this.is_object(_context)) {
        return _context;
      } else if(this.pragmas["IMPLICIT-ITERATOR"]) {
        var iterator = this.pragmas["IMPLICIT-ITERATOR"].iterator || ".";
        var ctx = {};
        ctx[iterator] = _context
        return ctx;
      }
    },

    is_object: function(a) {
      return a && typeof a == "object"
    },

    /*
      Thanks Doug Crockford
      JavaScript — The Good Parts lists an alternative that works better with
      frames. Frames can suck it, we use the simple version.
    */
    is_array: function(a) {
      return (a &&
        typeof a === "object" &&
        a.constructor === Array);
    },

    /*
      Gets rid of leading and trailing whitespace
    */
    trim: function(s) {
      return s.replace(/^\s*|\s*$/g, "");
    },

    /*
      Why, why, why? Because IE. Cry, cry cry.
    */
    map: function(array, fn) {
      if (typeof array.map == "function") {
        return array.map(fn)
      } else {
        var r = [];
        var l = array.length;
        for(i=0;i<l;i++) {
          r.push(fn(array[i]));
        }
        return r;
      }
    }
  };

  return({
    name: "mustache.js",
    version: "0.2.2",

    /*
      Turns a template and view into HTML
    */
    to_html: function(template, view, partials, send_fun) {
      var renderer = new Renderer();
      if(send_fun) {
        renderer.send = send_fun;
      }
      renderer.render(template, view, partials);
      return renderer.buffer.join("\n");
    }
  });
}();

if (typeof QuestionChain == "undefined"){
	var QuestionChain = {};
};

QuestionChain = new Class({
	Implements: [Events, Options],

	options: {
	},

	initialize: function(question_json, options){
		this.setOptions(this.options);
		this.question = question_json;
		this.label = this.question.label;
		this.description = this.question.description;
		if (!(this.loaded = (this.parse_ui_groups()))){
			this.show_load_error("Question Could Not Be Loaded; Parsing Error");
		}
	},

	build_ui_groups: function(ui_groups){
		return ui_groups.each(function(ui_group){
			return new QuestionChain.UiGroup(ui_group);
		});
	},

	parse_ui_groups: function(){
		var result = $try(function(){
			this.ui_groups = this.build_ui_groups(this.question.ui_groups);
			return true;
		}.bind(this),
		function(){
			return false;
		});
		return result;
	},

	show_load_error: function(message){
		document.id("global_notice").set("html", message).highlight('#ddf', '#ccc');
	},

	view_hash: function(){
		return {"label" : this.label, "description" : this.description};
	},

	render: function(){
	}
});




QuestionChain.UiGroup = new Class({

	initialize: function(json_ui_group){
		this.id = json_ui_group.id;
		this.name = json_ui_group.name;
		this.label = json_ui_group.label;
		this.description = json_ui_group.description;
		this.json_ui_objects = json_ui_group.ui_objects;
		this.relatable_category_drop_downs = [];
		if ($defined(json_ui_group.relatable_category_filter)) {
		  this.relatable_category_filters = json_ui_group.relatable_category_filter.filters;
		} else {
		  this.relatable_category_filters = [];
		}
		this.loaded = this.parse_ui_objects();
		if (this.loaded){
			this.ui_objects.each(function(ui_object){
				ui_object.group_loaded();
			});
		}
		this.element = document.id(this.dom_id());
		this.element.store("question_chain:ui-object", this);
	},

	enabled_relatable_category_drop_downs: function(){
	  return this.relatable_category_drop_downs.filter(function(rc){
	    return rc.enabled;
	  });
	},

	dom_id: function(){
		return ("ui_object_" + this.id);
	},

	relatable_category_ids: function(){
		var ids = this.enabled_relatable_category_drop_downs().map(function(rcat, index){
			return "object_ids[]="+(rcat.value || rcat.form_element_value());
		}, this);
		return ids.combine(this.get_relatable_category_filters());
	},

	relatable_category_ids_with_related_attribute: function(base_relatable_category){
		var index = base_relatable_category.index;
		var start_index = this.enabled_relatable_category_drop_downs()[0].index;
		var size = (index - start_index)+1;
		params = this.enabled_relatable_category_drop_downs().slice(0,size).map(function(rcat, index){
			if ((base_relatable_category.id != rcat.id)) {
					if ((rcat.value || rcat.form_element_value()) !== ""){
						return "object_ids[]="+(rcat.value || rcat.form_element_value());
					}
				}
		}, this);
		params.unshift("object_ids[]="+(base_relatable_category.value || base_relatable_category.form_element_value()));
    params.combine(this.get_relatable_category_filters());
		return params;
	},

	get_relatable_category_filters: function(){
	  return this.relatable_category_filters.map(function(filter){
	    return "object_ids[]=" + filter;
	  });
	},

	relatable_category_values: function(){
		return this.relatable_category_drop_downs.map(function(rcat, index){
			return {"name" : "relatable_category_values[]", "value" : function(){return ($defined(rcat.form_element_value()) && rcat.form_element_value() !== "") ? rcat.selected_option_text() : ""}};
		}, this);
	},

	parse_ui_objects: function(){
		var result = $try(function(){
			this.ui_objects = this.build_ui_objects(this.json_ui_objects);
			return true;
		}.bind(this),
		function(){
			return false;
		});
		return result;
	},

	fired_all_ui_object_rules: function(){
		return this.ui_objects.every(function(ui_object){
			return ui_object.all_rules_fired();
		});
	},

	build_ui_objects: function(ui_objects){
		return ui_objects.map(function(ui_object, index){
			switch(ui_object._type){
			case "UiObjects::DropDown":
				return new QuestionChain.UiObject.DropDown(ui_object, this, index);
			  break;
		 	case "UiObjects::CheckBox":
				return new QuestionChain.UiObject.CheckBox(ui_object, this, index);
			  break;
		 	case "UiObjects::TextField":
				return new QuestionChain.UiObject.TextField(ui_object, this, index);
			  break;
		 	case "UiObjects::ObjectSearch":
				return new QuestionChain.UiObject.ObjectSearch(ui_object, this, index);
			  break;
		 	case "UiObjects::HiddenField":
				return new QuestionChain.UiObject.HiddenField(ui_object, this, index);
			  break;
		 	case "UiObjects::ObjectReferenceDropDown":
				var obj_ref = new QuestionChain.UiObject.ObjectReferenceDropDown(ui_object, this, index);
				this.object_reference_drop_down = obj_ref;
				return this.object_reference_drop_down;
			  break;
		 	case "UiObjects::RelatableCategoryDropDown":
				var relatable_dd = new QuestionChain.UiObject.RelatableCategoryDropDown(ui_object, this, index);
				this.relatable_category_drop_downs.push(relatable_dd);
				return relatable_dd;
			  break;
			}
		}.bind(this));
	}

});
QuestionChain.UiObject = new Class({
	Binds: ['element_listener', 'render'],

	initialize: function(json_object, ui_group, index){
		this.id = json_object.id;
		this.ui_group = ui_group;
		this.index = index;
		this.name = "answer["+json_object.name+"]";
		this.label = json_object.label;
		this.description = json_object.description;
		this.value = json_object.value;
		this.extra_info = json_object.extra_info;
		this.has_extra_info = $defined(this.extra_info);
		this.ui_attributes = json_object.ui_attributes;
		this.default_value = json_object.default_value;
		this.visible = this.ui_attributes.visible;
		this.enabled = this.ui_attributes.enabled;
		this.rules = this.buildRules(json_object.rules);
		this.html_template = this.get_template();
		this.element = document.id(this.dom_id());

		if (!$defined(this.element)){
			this.render(true);
			this.element = document.id(this.dom_id());
		}

		this.element.store("question_chain:ui-object", this);
		if (this.rules.length > 0){
			this.add_element_listner();
		}
	},

	add_element_listner: function(){
	},

	element_listener: function(){
	},

	all_rules_fired: function(){
		if (this.rules.length === 0) return true;
		return this.rules.every(function(rule){
			return rule.fired === true;
		});
	},

	value_text: function(){
		return this.value;
	},

	group_loaded: function(){

	},

	form_element_value: function(){
		return this.form_element().get("value");
	},

	form_element_name: function(){
		return this.form_element().get("name");
	},

	form_element: function(){
		return document.id(this.input_id());
	},

	dom_id: function(){
		return ("ui_object_" + this.id);
	},

	input_id: function(){
		return ("ui_input_" + this.id);
	},

	buildRules: function(rules){
		return rules.map(function(rule, index){
			switch(rule._type){
				case "Rules::AttributeChange":
				return new QuestionChain.Rule.AttributeChange(rule);
				case "Rules::PopulateDropDown":
				return new QuestionChain.Rule.PopulateDropDown(rule);
				case "Rules::ValueChange":
				return new QuestionChain.Rule.ValueChange(rule);
				case "Rules::Search":
				return new QuestionChain.Rule.Search(rule);
				break;
			}
		}, this);
	},

	get_template: function(){
	},

	view_hash: function(){
		return {extra_info: this.extra_info, has_extra_info: this.has_extra_info, input_id: this.input_id(), dom_id: this.dom_id(), default_styles: "", name: this.name};
	},

	render: function(force){
		html = Mustache.to_html(this.html_template, this.view_hash());
		if (force){
			document.id("ui_objects").adopt(html_elements);
		} else {
			this.element.set("html", html.stripTags('dl'));
			this.add_element_listner();
		}
	}
});
QuestionChain.UiObject.TextField = new Class({
	Extends: QuestionChain.UiObject,

	initialize: function(json_bundle, ui_group, index){
		this.parent(json_bundle, ui_group, index);
	},

	get_template: function(){
		return uiObjectsTextFieldTemplate;
	},

	view_hash: function(){
		return $extend(this.parent(), {label : this.label, default_value: this.default_value, value : this.value});
	}

});
QuestionChain.UiObject.DropDown = new Class({
	Extends: QuestionChain.UiObject,

	initialize: function(json_bundle, ui_group, index){
		this.parent(json_bundle, ui_group, index);
		this.selected_value = json_bundle.selected_value;
		this.populate = json_bundle.populate;
		this.prompt = json_bundle.prompt;
		this.ui_options = json_bundle.options;
		this.has_drop_down_target = false;
		this.parse_options();
	},

	parse_options: function(){
		this.ui_options = this.ui_options.map(function(option){
			if (!!this.value){
				var selected = (option.value.toString() == this.value.toString());
				return {"name" :  option.name, "value" : option.value, "selected": selected};
			} else {
				return {"name" : option.name, "value" : option.value};
			}
		}, this);
	},

	add_element_listner: function(){
		this.form_element().addEvent("change", this.element_listener);
	},

	element_listener: function(event){
		event.stop();
		var element = $(event.target);
		var value = element.getSelected()[0].value;
		if (value !== ""){
			this.rules.each(function(rule){
				rule._fire(value, this.value_text());
			}, this);
		}
	},

	selected_option: function(){
		return this.form_element().getSelected()[0];
	},

	remote_rules: function(){
		return this.rules.filter(function(rule){
			return rule.remote === true;
		});
	},

	non_remote_rules: function(){
		return this.rules.filter(function(rule){
			return rule.remote === false;
		});
	},

	remote_rules: function(){
		return this.rules.filter(function(rule){
			return rule.remote === true;
		});
	},

	group_loaded: function(){
		if (this.value){
			this.remote_rules().each(function(rule){
				rule._fire(this.value, this.value_text());
			}, this);
			this.check_completed_remote_rules.periodical(1000, this);
		}
	},

	check_completed_remote_rules: function(){
		var completed = this.remote_rules().every(function(rule){
			return rule.fired === true;
		});

		if (completed) {
			$clear(this.check_completed_remote_rules);
			this.non_remote_rules().each(function(rule){
				rule._fire(this.value, this.value_text());
			}, this);
		}
	},

	value_text: function(){
		return this.selected_option_text();
	},

	selected_option_text: function(){
		return this.selected_option().get("html");
	},

	get_template: function(){
		return uiObjectsDropDownTemplate;
	},

	clear_target_options: function(){
		if (this.has_drop_down_target){
			if (this.ui_group.fired_all_ui_object_rules()){
				var target = this.drop_down_target();
				target.ui_options = [];
				target.render();
				target.clear_target_options();
			}
		}
	},

	view_hash: function(){
		return $extend(this.parent(), {prompt: this.prompt, label : this.label, options: this.ui_options});
	}
});
QuestionChain.UiObject.CheckBox = new Class({
	Extends: QuestionChain.UiObject,

	initialize: function(json_bundle, ui_group, index){
		this.checked = this.value || json_bundle.checked;
		this.parent(json_bundle, ui_group, index);
	},

	add_element_listner: function(){
		var relay_event = "click:relay(#"+this.input_id()+")";
		document.id("question").addEvent(relay_event, this.listener_event);
	},

	element_listener: function(event){
		var element = $(event.target);
		var value = element.get("checked");
		this.rules.each(function(rule){
			rule._fire(value);
		});
	},

	form_element_value: function(){
		this.form_element().get("checked");
	},

	get_template: function(){
		return uiObjectsCheckboxTemplate;
	},

	view_hash: function(){
		return $extend(this.parent(), {label : this.label, checked: this.checked});
	}
});
QuestionChain.UiObject.ObjectReferenceDropDown = new Class({
	Extends: QuestionChain.UiObject.DropDown,

	initialize: function(json_bundle, ui_group, index){
		this.drop_down_target_id = "ui_object_"+json_bundle.drop_down_target_id;
		this.parent(json_bundle, ui_group, index);
		if ($defined(json_bundle.drop_down_target_id)) this.has_drop_down_target = true;
	},

	target_drop_down_param_string: function(){
		var original_values  = ["object_ids[]="+(this.value || this.form_element_value())];
		original_values.push("ui_object_id="+this.id);
		return original_values;
	},

	drop_down_target: function(){
		return document.id(this.drop_down_target_id).retrieve("question_chain:ui-object");
	},

	get_template: function(){
		return uiObjectsObjectReferenceDropDownTemplate;
	}
});
QuestionChain.UiObject.RelatableCategoryDropDown = new Class({
	Extends: QuestionChain.UiObject.DropDown,

	initialize: function(json_bundle, ui_group, index){
		this.drop_down_target_id = "ui_object_"+json_bundle.drop_down_target_id;
		this.drop_down_target_is_relatable = json_bundle.drop_down_target_is_relatable;
		this.parent(json_bundle, ui_group, index);
		if ($defined(json_bundle.drop_down_target_id)) this.has_drop_down_target = true;
	},

	drop_down_target: function(){
		return document.id(this.drop_down_target_id).retrieve("question_chain:ui-object");
	},

	target_drop_down_param_string: function(){
	  var original_values;
		if (this.drop_down_target_is_relatable){
			original_values = this.ui_group.relatable_category_ids_with_related_attribute(this);
		} else {
			original_values = this.ui_group.relatable_category_ids();
		}
		original_values.push("ui_object_id="+this.id);
		return original_values;
	},

	get_template: function(){
		return uiObjectsRelatableCategoryDropDownTemplate;
	}
});
QuestionChain.UiObject.ObjectSearch = new Class({
	Extends: QuestionChain.UiObject,

	initialize: function(json_bundle, ui_group, index){
		this.parent(json_bundle, ui_group, index);
	},

	get_template: function(){
		return uiObjectsObjectSearchTemplate;
	},

	search_name: function(){
		return "answer[search_"+ this.name+"]";
	},

	search_id: function(){
		return "search_"+ this.dom_id();
	},

	group_loaded: function(){
		this.rules.each(function(rule){
			rule._fire();
		});
	},

	fire_param_string: function(){
		var original_values = this.ui_group.relatable_category_values();
		original_values = original_values.clean();
		original_values.push({"name" : "ui_object_id", "value": this.id});
		return original_values
	},

	view_hash: function(){
		return $extend(this.parent(), {searach_id: this.search_id(), search_name: this.search_name(), label : this.label, default_value: this.default_value, value : this.value});
	}
});
QuestionChain.UiObject.HiddenField = new Class({
	Extends: QuestionChain.UiObject,

	initialize: function(json_bundle, ui_group, index){
		this.parent(json_bundle, ui_group, index);
	},

	get_template: function(){
		return uiObjectsHiddenFieldTemplate;
	},

	group_loaded: function(){
		if (this.value){
			this.rules.each(function(rule){
				rule._fire(this.value);
			}, this);
		}
	},

	view_hash: function(){
		return $extend(this.parent(), {label : this.label, default_value: this.default_value, value : this.value});
	}
});
QuestionChain.Rule = new Class({

	initialize: function(rule){
		this.id = rule.id;
		this.fired = false;
		this.remote = false;
		this.compare_text_value = rule.compare_text_value;
		this.ui_object_id = rule.ui_object_id;
		this.fire_value = rule.fire_value;
	},

	ui_object: function(){
		this.ui_object_element = $("ui_object_"+this.ui_object_id);
		return this.ui_object_element.retrieve("question_chain:ui-object");
	},

	_fire: function(value, value_text){
		var ui_object = this.ui_object();
		if (ui_object.all_rules_fired()){
			ui_object.value = undefined;
		}
		this.fire(value, value_text);
	},

	parse_hash_keys: function(key){
		var keys = [];
		var parsed_key = "";
		$H(key).each(function(value, key){
			keys.push((key + "." + value));
		});
		return keys;
	}
});
QuestionChain.Rule.AttributeChange = new Class({
	Extends: QuestionChain.Rule,

	initialize: function(rule){
		this.parent(rule);
		this.negate_value = rule.negate_value;
		this.compare_text_value = rule.compare_text_value;
		this.affecting_ui_objects = $H(rule.affecting_ui_objects);
		this.attribute_handlers = $H({
				visible: {
					"false": function(ui_object){
						var element = ui_object.element;
						element.setStyle("visibility", "hidden");
						element.hide();
					},
				 	 "true": function(ui_object){
					  var element = ui_object.element;
						element.setStyle("visibility", "visible");
						element.show();
					}
				},
				enabled:{
					"false": function(ui_object){
						ui_object.enabled = false;
						ui_object.form_element().setProperty("disabled", "disabled");
					},
					"true": function(ui_object){
						ui_object.enabled = true;
						ui_object.form_element().removeProperty("disabled");
					}
				}
			});
	},

	call_attribute_handler: function(element, key){
		var keys = this.parse_hash_keys(key);
		keys.each(function(key){
			if (this.attribute_handlers.getFromPath(key)){
				this.attribute_handlers.getFromPath(key)(element);
			}
		},this);
	},

	call_handlers: function(){
		this.affecting_ui_objects.each(function(value, key){
			var ui_object_element = document.id("ui_object_"+key);
			var ui_object =  ui_object_element.retrieve("question_chain:ui-object");
			if (ui_object) this.call_attribute_handler(ui_object, value);
		}, this);
	},

	fire: function(value, value_text){
		if (this.compare_text_value){
			if (this.negate_value){
				if (this.fire_value != value_text) this.call_handlers();
			} else {
				if (this.fire_value == value_text) this.call_handlers();
			}
		} else {
			if (this.negate_value){
				if (this.fire_value != (value || "").toString()) this.call_handlers();
			} else{
				if (this.fire_value == (value || "").toString()) this.call_handlers();
			}
		}
		this.fired = true;
	}
});
QuestionChain.Rule.PopulateDropDown = new Class({
	Extends: QuestionChain.Rule,

	initialize: function(rule){
		this.parent(rule);
		this.remote = true;
		this.ui_object_attribute_check = rule.ui_object_attribute_check;
		this.drop_down_target_id = rule.drop_down_target_id;
	},

	drop_down_target: function(){
		var target = this.drop_down_target_element().retrieve("question_chain:ui-object");
		return target;
	},

	drop_down_target_element: function(){
		var target_element =  document.id("ui_object_"+this.drop_down_target_id);
		return target_element;
	},

	_fire: function(value){
		var ui_object = this.ui_object();
		if (ui_object.all_rules_fired()){
			ui_object.value = undefined;
		}
		if (typeof this.ui_object_attribute_check != "undefined") {
			var can_get_options = $H(this.ui_object_attribute_check).every(function(value, key){
			var ui_object = document.id("ui_object_"+key);
			return ui_object.getStyle(value["attribute"]) == value["value"];
			}, this);
			if (can_get_options) {
				this.disable_target();
				this.get_options(value);
			}
		} else {
			this.disable_target();
			this.get_options(value);
		}
	},

	disable_target: function(){
		this.drop_down_target_element().addClass("loading");
		this.drop_down_target().form_element().set("disabled", "disabled");
	},

	enable_target: function(){
		this.drop_down_target_element().removeClass("loading");
		this.drop_down_target().form_element().set("disabled", "");
	},

	fire: function(options){
		var target_drop_down = this.drop_down_target();
		target_drop_down.ui_options = options;
		target_drop_down.parse_options();
		target_drop_down.render();
		target_drop_down.clear_target_options();
		this.fired = true;
	},

	get_options: function(value){
		var request = new Request.JSON({
			data: ["rule_id="+this.id, this.ui_object().target_drop_down_param_string()].flatten().join("&"),
			url: "/answers/fire_populate_drop_down",
			onComplete: function(){
				this.enable_target();
			}.bind(this),
			onSuccess : function(responseJSON){
				this.fire(responseJSON.options);
			}.bind(this)
		}).send();
	}
});
QuestionChain.Rule.Search = new Class({
	Extends: QuestionChain.Rule,

	initialize: function(rule){
		this.parent(rule);
	},

	ui_object_input_id: function(){
		return this.ui_object().input_id();
	},

	ui_object_search_id: function(){
		return this.ui_object().search_id();
	},

	group_loaded: function(){
		this.rules.each(function(rule){
			rule._fire();
		});
	},

	fire_param_string: function(){
		var original = this.ui_object().fire_param_string();
		original.push({"name": "rule_id", "value" : this.id});
		return original;
	},

	fire: function(){
		this.autocomplete = new Meio.Autocomplete.Select(
			this.ui_object_search_id(),
			"/answers/fire_object_search",
			{
				minChars: 3,
				syncName: false,
				valueField: document.id(this.ui_object_input_id()),
				valueFilter: function(data){
					return data.value;
				},
				filter: {
					type: 'contains',
				  path: 'name'
				},
				urlOptions: {
					extraParams : this.fire_param_string()
				}
		});
	}
});



