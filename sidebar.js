function getTabId( elem ){ return elem.classList.contains( "tab" ) ? parseInt( elem.id ) : getTabId( elem.parentElement ) }
function closeTab( e ) { browser.tabs.remove( getTabId( e.target ) ) }
function getIndex( id ) { return TAB_LIST.findIndex( v => v.id == id ) }
function setMargin( elem , indent ) { elem.style["margin-left"] = String( 10 * indent ) + "px" }
function newTab( e ) { if ( e.button == 0 ) browser.tabs.create( {} ) }
function update( i ) { if ( i != -1 ) { browser.tabs.get( TAB_LIST[i].id ).then( tab => onUpdated( tab.id , false , tab ) ) } }
function hasChildren( i ) { return TAB_LIST[i + 1] != undefined && TAB_LIST[i + 1].indent > TAB_LIST[i].indent }
function getParent( j , i = j ) { return i > 0 && TAB_LIST[i - 1].indent >= TAB_LIST[j].indent ? getParent( j , i - 1 ) : i - 1 }
function getLastDescendant( parent ) { return TAB_LIST.findIndex( ( v , i , arr ) =>
	// i == arr.length - 1 || parent != -1 && i + 1 > parent && arr[i + 1].indent <= arr[parent].indent ) }
	i == arr.length - 1 || i + 1 > parent && arr[i + 1].indent <= arr[parent].indent ) }
function getLastChild( parent ) {
	let descendants = TAB_LIST.slice( parent + 1 , getLastDescendant( parent ) + 1 )
	return descendants.map( v => v.indent ).lastIndexOf( TAB_LIST[parent].indent + 1 ) + parent;
	// TAB_LIST.map( ( v , i ) => i > parent && i <= index && v.indent == indent ).lastIndexOf( true );
}
function showOrHideChildrenRecursive( parent , hide ) {
	let lastChild = getLastDescendant( parent );
	for ( let i = parent + 1; i <= lastChild; i++ ) {
		document.getElementById( TAB_LIST[i].id ).style.display = hide ? "none" : "";
		TAB_LIST[i].hide = hide;
		if ( TAB_LIST[i].hideChildren ) { i = showOrHideChildrenRecursive( i , true ) }
	}
	return lastChild;
}
function showOrHideChildren( parent , hide ) {
	TAB_LIST[parent].hideChildren = hide == "hide" ? true : false;
	showOrHideChildrenRecursive( parent , hide == "hide" ? true : false );
	update( parent );
}
function dblclick( e ) {
	let index = getIndex( getTabId( e.target ) );
	showOrHideChildren( index , TAB_LIST[index].hideChildren ? "show" : "hide" );
}
function clicked( e ) {
	let tabId = getTabId( e.target );
	if ( e.button == 0 ) {
		browser.tabs.update( tabId , { "active" : true } );
	}
	if ( e.button == 1 ) {
		closeTab( e ); e.preventDefault();
	}
	// if ( e.button == 2 ) {} // do context menu stuff
}
function setTabInfo( index , tab ) { // call from make
	// browser.sessions.setTabValue()
	// what to record:
	// parent tab, index relative to parent, next sibling of parent, prev sibling of parent, children
	// let id = tab.id;
	// let url = tab.url;
	let indent = TAB_LIST[index].indent
	let parent = getParent( index );
	// let parentId = TAB_LIST[parent].id;
	let lastSibling = getLastChild( parent );
	let siblings = TAB_LIST.filter( ( v , i ) => i > parent && i <= lastSibling && v.indent == indent ).map( v => v.id );
	let i = siblings.findIndex( ( v , i , arr ) => v == arr[index].id );
	let prevSibling = i - 1 > 0               ? siblings[i - 1] : false;
	let nextSibling = i + 1 < siblings.length ? siblings[i + 1] : false;
	let lastChild = getLastChild( index );
	let children = TAB_LIST.filter( ( v , i ) => i > index && i <= lastChild && v.indent == indent ).map( v => v.id );


	// what to record:
	// parent's children, parent, index relative to parent, children

	if ( parent != -1 ) {
		browser.sessions.setTabValue( TAB_LIST[index].id , "parent" , TAB_LIST[parent].id );
		browser.sessions.setTabValue( TAB_LIST[parent].id , "children" , siblings );
	}
	if ( children.length > 0 ) {
		browser.sessions.setTabValue( TAB_LIST[index].id , "children" , children );
	}
	browser.sessions.setTabValue()




	// need to also setTabInfo for parent, all next siblings, all children.
	// to prevent infinite/unnecessary recursion, if nothing significant changed, don't recurse.

}


function makeElem( tab ) {
	// console.log( tab.successorTabId );
	let elem = document.importNode( document.getElementById( "tabTemplate" ) , true ).content.firstChild;
	let index = getIndex( tab.id );
	elem.querySelector( ".title" ).innerText = tab.title;
	elem.id = tab.id;
	// elem.querySelector( ".close" ).addEventListener( "click" , closeTab ); // may want to reinstate the "x" to close tabs.
	setMargin( elem , TAB_LIST[index].indent );
	elem.addEventListener( "mousedown" , clicked );
	elem.addEventListener( "dblclick" , dblclick );
	elem.querySelector( ".expand" ).addEventListener( "mousedown" , dblclick );
	if ( tab.favIconUrl ) { elem.querySelector( ".favicon" ).firstChild.src = tab.favIconUrl }
	if ( tab.active ) { elem.classList.add( "active" ) }

	if ( TAB_LIST[index].hide ) { elem.style.display = "none" }
	if ( hasChildren( index ) ) { elem.querySelector( ".triangle" ).classList.add( TAB_LIST[index + 1].hide ? "right" : "down" ) }
	return elem;
}
function make( tab , index , indent ) {
	TAB_LIST.splice( index , 0 , { "id" : tab.id , "indent" : indent , "hide" : false , "hideChildren" : false } );
	TABS_ELEM.insertBefore( makeElem( tab ) , TABS_ELEM.children[index] );
	// if ( TAB_LIST[index] ) console.log(document.getElementById(TAB_LIST[index].id).offsetHeight); // CHECKS IF ALL TABS ARE THE SAME HEIGHT.

	// setTabInfo should go here.


}
async function makeAll() {
	let tabs = await browser.tabs.query( { "currentWindow" : true } );
	// tabs.forEach( tab => make( tab , TAB_LIST.length , 0 ) );
	tabs.forEach( tab => onCreated( tab , true ) );
	document.getElementById( tabs.find( v => v.active ).id ).classList.add( "active" );
	setSuccessors();
}
async function onActivated( activeInfo ) {
	let tabs = await browser.tabs.query( { "currentWindow" : true } );
	tabs.forEach( tab => document.getElementById( tab.id ).classList.toggle( "active" , tab.active ) );


	// todo: make sure all active tab's ancestors are expanded
	// I don't need to do this if successor does #1 instad of #2. It currently does #2
	// p
	//  c    #1 goto here
	//   g   #2 goto here
	//  c    this is active and get's closed
	//   g
	//    g
	// p


}
function setSuccessors() {
	TAB_LIST.forEach( ( v , i , arr ) => {
		let successor = arr[i + 1] && v.indent > arr[i + 1].indent ? arr[i - 1].id : undefined;
		browser.tabs.update( TAB_LIST[i].id , { "successorTabId" : successor } )
	} );
}
function onCreated( tab , startup = false ) {
	let parent = getIndex( tab.openerTabId );
	let notChild = tab.title == "New Tab" || tab.openerTabId == undefined || startup;
	let index = notChild ? TAB_LIST.length : parent + 1; // will need to alter "parent + 1" for ctrl+shift+t
	let indent = notChild ? 0 : TAB_LIST[parent].indent + 1;
	make( tab , index , indent );
	browser.tabs.move( tab.id , { "index" : index } ); // I need this so ctrl-tab and the like work correctly
	if ( indent > 0 ) { showOrHideChildren( getParent( index ) , "show" ) }
	if ( !startup ) { setSuccessors() }
}
function onRemoved( tabId , removeInfo ) {
	let index = getIndex( tabId );
	showOrHideChildren( index , "show" ); // make sure all promoted children are visible
	update( getParent( index ) ); // update if parent has tree twisty // may have async issues later. No issues now.
	let lastDescendant = getLastDescendant( index ); // this must be defined outside the for loop. trust me.
	for ( let i = index + 1; i <= lastDescendant; i++ ) {
		TAB_LIST[i].indent--;
		setMargin( document.getElementById( TAB_LIST[i].id ) , TAB_LIST[i].indent );
	}
	TAB_LIST.splice( index , 1 );
	document.getElementById( tabId ).remove();
	setSuccessors();

	// browser.sessions.getRecentlyClosed().then( s => {closedTabs = s;console.log( closedTabs );} );
}
function onUpdated( tabId , changeInfo , tab ) {
	try { document.getElementById( tabId ).replaceWith( makeElem( tab ) ) } catch ( e ) {} // document.getElementById( tabId ) sometimes doesn't exist yet. It never actually matters though.
}
let OPTIONS = 0;
let TAB_LIST = [], TABS_ELEM, closedTabs;
window.onload = function() {
	TABS_ELEM = document.getElementById( "tabList" );
	makeAll()

	// browser.sessions.getRecentlyClosed().then( s => {closedTabs = s;console.log( closedTabs );} );

	document.getElementById( "newTab" ).addEventListener( "click" , newTab )
	browser.tabs.onActivated.addListener( onActivated )
	// browser.tabs.onAttached.addListener() // will probably just call onCreated
	browser.tabs.onCreated.addListener( onCreated ) // need logic for where to put the tab in the list.
	// browser.tabs.onDetached.addListener() // will probably just call onRemoved
	// browser.tabs.onMoved.addListener() // If I remove the tab bar, this wont be nessessary.
	browser.tabs.onRemoved.addListener( onRemoved )
	browser.tabs.onUpdated.addListener( onUpdated )
}



// get successorTabId shit working.

// remake tree on undo close tab.
// can't really detect undo close tab.
// Only way I can find is if on onUpdate the tab starts as an about:blank tab. Doesn't work if undoing an about:<something> tab
// Maybe I can detect google searches the same way.
// AND/OR detecting it using history api.
// OOOOOORRRRRRRRRR hijack the ctrl shift t hotkey (wouldn't work for manually restoring (which I do with firegestures.))

// fix indentation css stuff.

// do setup stuff on browser start.
	// re-set all the ids in TAB_LIST

// enable dragging of tabs

// on right click open context menu
// do things with options.

// do somthing about behaviour after last tab closed and undo last tab is done.
// I'm thinking I'll wait to see if it gets fixed.


