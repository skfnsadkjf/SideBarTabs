function getTabId( elem ){ return elem.className == "tab" ? parseInt( elem.id ) : getTabId( elem.parentElement ) }
function closeTab( e ) { browser.tabs.remove( getTabId( e.target ) ) }
function getIndex( id ) { return tabList.findIndex( v => v.id == id ) }
function setMargin( elem , indent ) { elem.style["margin-left"] = String( 10 * indent ) + "px" }
function newTab( e ) { if ( e.button == 0 ) browser.tabs.create( {} ) }
function clicked( e ) {
	var tabId = getTabId( e.target );
	if ( e.button == 0 ) { browser.tabs.update( tabId , { "active" : true } ) }
	if ( e.button == 1 ) { closeTab( e ); e.preventDefault() }
	// if ( e.button == 2 ) {} // do context menu stuff
}
function makeElem( tab ) {
	var elem = document.importNode( document.getElementById( "tabTemplate" ) , true ).content;
	if ( tab.status != "complete" ) elem.querySelector( ".favicon" ).firstChild.src = "icons/beasts-48-2.png";
	else if ( tab.favIconUrl )      elem.querySelector( ".favicon" ).firstChild.src = tab.favIconUrl;
	else                            elem.querySelector( ".favicon" ).src = "icons/beasts-48-2.png";
	elem.querySelector( ".title" ).innerText = tab.title;
	elem.querySelector( ".tab" ).id = tab.id;
	elem.querySelector( ".close" ).addEventListener( "click" , closeTab );
	setMargin( elem.querySelector( ".tab" ) , tabList[getIndex( tab.id )].indent );
	elem.querySelector( ".tab" ).addEventListener( "mousedown" , clicked );
	if ( tab.active ) elem.querySelector( ".tab" ).style["background-color"] = "#a0a0d0"; // Only for startup. Maybe seperate into makeAll.
	return elem;
}
function make( tab , index , indent ) {
	tabList.splice( index+1 , 0 , { "id" : tab.id , "indent" : indent } );
	var elem = makeElem( tab );
	var t = document.getElementById( "tabList" );
	if ( t.children[index] ) t.insertBefore( elem , t.children[index].nextElementSibling );
	else document.querySelector( "#tabList" ).appendChild( elem ); // Only for startup. Maybe seperate into makeAll.
	// if ( tabList[index] ) console.log(document.getElementById(tabList[index].id).offsetHeight); // CHECKS IF ALL TABS ARE THE SAME HEIGHT.
}
function makeAll() {
	var t = browser.tabs.query( { "currentWindow" : true } );
	t.then( tabs => tabs.forEach( tab => {
		if ( tab.active ) activeTabId = tab.id;
		make( tab , tabList.length , 0 )
	}));
}
function onActivated( e ) {
	var oldActive = document.getElementById( activeTabId ) // needed for when oldActive tab was closed
	if ( oldActive ) oldActive.style["background-color"] = null;
	activeTabId = e.tabId;
	document.getElementById( activeTabId ).style["background-color"] = "#a0a0d0";
}
function onCreated( tab ) {
	console.log( tab.url )
	var tabListIndex = getIndex( activeTabId );
	var index = tab.title == "New Tab" ? tabList.length : tabListIndex;
	var indent = tab.title == "New Tab" ? 0 : tabList[tabListIndex].indent + 1;
	make( tab , index , indent );
	browser.tabs.move( tab.id , { "index" : index+1 } );
	console.log(tab.id)
}
function onRemoved( tabId ) {
	var tabListIndex = getIndex( tabId );
	var i = tabListIndex + 1;
	while ( tabList[i] && tabList[i].indent > tabList[tabListIndex].indent ) { // un-indent following tabs which are more indented that this tab.
		tabList[i].indent--;
		setMargin( document.getElementById( tabList[i].id ) , tabList[i].indent );
		i++;
	}
	tabList.splice( tabListIndex , 1 );
	document.getElementById( tabId ).remove();
	console.log(tabId);
}
function onUpdated( tabId ) {
	var tab = browser.tabs.get( tabId );
	tab.then( tab => {
		console.log( tab.url )
		if ( tab.url == "about:blank" ) console.log("I hope you just did Undo Close Tab!!!")
		document.getElementById( tabId ).replaceWith( makeElem( tab ) )
	});
}
var OPTIONS = 0;
var activeTabId , tabList = [];
makeAll()
document.getElementById( "newTab" ).addEventListener( "click" , newTab )
browser.tabs.onActivated.addListener( onActivated )
// browser.tabs.onAttached.addListener() // will probably just call onCreated
browser.tabs.onCreated.addListener( onCreated ) // need logic for where to put the tab in the list.
// browser.tabs.onDetached.addListener() // will probably just call onRemoved
// browser.tabs.onMoved.addListener() // If I remove the tab bar, this wont be nessessary.
browser.tabs.onRemoved.addListener( onRemoved )
browser.tabs.onUpdated.addListener( onUpdated )


// remake tree on undo close tab.
// can't really detect undo close tab.
// Only way I can find is if on onUpdate the tab starts as an about:blank tab. Doesn't work if undoing an about:<something> tab
// Maybe I can detect google searches the same way.
// AND/OR detecting it using history api.
// OOOOOORRRRRRRRRR hijack the ctrl shift t hotkey (wouldn't work for manually restoring (which I do with firegestures.))

// insert tab at end if it was made via search bar.

// tree twisties

// fix indentation css stuff.

// enable dragging of tabs

// on right click open context menu
// do things with options.

// do somthing about behaviour after last tab closed and undo last tab is done.
// I'm thinking I'll wait to see if it gets fixed.




// 59 lines

// function getTabId( elem ){ return elem.className == "tab" ? parseInt( elem.id ) : getTabId( elem.parentElement ) }
// function closeTab( e ) { browser.tabs.remove( getTabId( e.target ) ) }
// function getIndex( id ) { for ( i in tabList ) { if ( tabList[i].tabId == id ) { return i } } }
// function clicked( e ) {
// 	var tabId = getTabId( e.target );
// 	if ( e.button == 0 ) { browser.tabs.update( tabId , { "active" : true } ) }
// 	if ( e.button == 1 ) { closeTab( e ); e.preventDefault() }
// 	// if ( e.button == 2 ) {} // do context menu stuff
// }
// function makeElem( tab ) {
// 	var elem = document.importNode( document.getElementById( "tab" ) , true ).content;
// 	if ( tab.status != "complete" ) elem.querySelector( ".favicon" ).firstChild.src = "icons/beasts-48-2.png";
// 	else if ( tab.favIconUrl )      elem.querySelector( ".favicon" ).firstChild.src = tab.favIconUrl;
// 	else                            elem.querySelector( ".favicon" ).src = "icons/beasts-48-2.png";
// 	elem.querySelector( ".title" ).innerText = tab.title;
// 	elem.querySelector( ".tab" ).id = tab.id;
// 	elem.querySelector( ".close" ).addEventListener( "click" , closeTab );
// 	var margin = 15 * tabList[getIndex( tab.id )].indent;
// 	elem.querySelector( ".tab" ).style["margin-left"] = margin.toString() + "px";
// 	elem.querySelector( ".tab" ).addEventListener( "mousedown" , clicked );
// 	return elem;
// }
// function make( tab , indent = 0 ) {
// 	console.log(tab)
// 	tabList.splice( tabList.length , 0 , { "tabId" : tab.id , "indent" : indent } );
// 	var elem = makeElem( tab );
// 	document.body.firstElementChild.appendChild( elem );
// }
// function makeAll() {
// 	var tabList = browser.tabs.query( { "currentWindow" : true } );
// 	tabList.then( tabs => tabs.forEach( tab => make( tab ) ) );
// }
// var tabList = [];
// var activeTabId;
// makeAll()
// function onActivated( e ) {
// 	var oldActive = document.getElementById( activeTabId ) // shouldn't need this. I should set activeTabId eariler.
// 	if ( oldActive ) oldActive.style["background-color"] = null;
// 	activeTabId = e.tabId;
// 	document.getElementById( activeTabId ).style["background-color"] = "#a0a0d0";
// }
// function onCreated( tab ) {
// 	make( tab , 1 )
// } // need logic for where to put the tab in the list.
// function onRemoved( tabId ) {
// 	tabList.splice( getIndex( tab.id ) , 1 );
// 	document.getElementById( tabId ).remove()
// }
// function onUpdated( tabId ) {
// 	var tab = browser.tabs.get( tabId )
// 	tab.then( tab => document.getElementById( tabId ).replaceWith( makeElem( tab ) ) )
// }
// browser.tabs.onActivated.addListener( onActivated )
// // browser.tabs.onAttached.addListener()
// browser.tabs.onCreated.addListener( onCreated ) // need logic for where to put the tab in the list.
// // browser.tabs.onDetached.addListener()
// // browser.tabs.onMoved.addListener()
// browser.tabs.onRemoved.addListener( onRemoved )
// browser.tabs.onUpdated.addListener( onUpdated )













