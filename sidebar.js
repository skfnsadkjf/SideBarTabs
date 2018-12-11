function getTabId( elem ){ return elem.classList.contains( "tab" ) ? parseInt( elem.id ) : getTabId( elem.parentElement ) }
function closeTab( e ) { browser.tabs.remove( getTabId( e.target ) ) }
function getIndex( id ) { return TAB_LIST.findIndex( v => v.id == id ) }
function setMargin( elem , indent ) { elem.style["margin-left"] = String( 10 * indent ) + "px" }
function newTab( e ) { if ( e.button == 0 ) browser.tabs.create( {} ) }
function getParent( index ) {
	let i = index - 1;
	while ( i >= 0 && TAB_LIST[i].indent >= TAB_LIST[index].indent ) { i-- }
	return i;
}
function hasChildren( i ) { return TAB_LIST[i + 1] != undefined && TAB_LIST[i + 1].indent > TAB_LIST[i].indent }
function getChildren( index ) {
	let i = index;
	while ( TAB_LIST[i + 1] != undefined && TAB_LIST[i + 1].indent > TAB_LIST[index].indent ) { i++ }
	return Array.from( { "length" : i - index } , ( v , j ) => j + index + 1 );
}
function showOrHideChildrenRecursive( parent , hide ) {
	let until = TAB_LIST.findIndex( ( v , i , arr ) => i == arr.length - 1 || i + 1 > parent && arr[i + 1].indent <= arr[parent].indent );
	for ( let i = parent + 1; i <= until; i++ ) {
		document.getElementById( TAB_LIST[i].id ).style.display = hide ? "none" : "";
		TAB_LIST[i].hide = hide;
		if ( TAB_LIST[i].hideChildren ) { i = showOrHideChildrenRecursive( i , true ) }
	}
	return until;
}
function showOrHideChildren( parent , hide ) {
	TAB_LIST[parent].hideChildren = hide == "hide" ? true : false;
	showOrHideChildrenRecursive( parent , hide == "hide" ? true : false );
	browser.tabs.get( TAB_LIST[parent].id ).then( tab => onUpdated( tab.id , false , tab ) );
}

function clicked( e ) {
	let tabId = getTabId( e.target );
	if ( e.button == 0 ) {
		browser.tabs.update( tabId , { "active" : true } );
		if ( tabId == activeTabId ) { // for expanding and contracting tab trees.
			let index = getIndex( tabId );
			showOrHideChildren( index , TAB_LIST[index].hideChildren ? "show" : "hide" );
		}
	}
	if ( e.button == 1 ) {
		closeTab( e ); e.preventDefault();
	}
	// if ( e.button == 2 ) {} // do context menu stuff
}
function makeElem( tab ) {
	let elem = document.importNode( document.getElementById( "tabTemplate" ) , true ).content.firstChild;
	let index = getIndex( tab.id );
	elem.querySelector( ".title" ).innerText = tab.title;
	elem.id = tab.id;
	// elem.querySelector( ".close" ).addEventListener( "click" , closeTab ); // may want to reinstate the "x" to close tabs.
	setMargin( elem , TAB_LIST[index].indent );
	elem.addEventListener( "mousedown" , clicked );
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
}
function makeAll() {
	let tabsInWindow = browser.tabs.query( { "currentWindow" : true } );
	tabsInWindow.then( tabs => tabs.forEach( tab => {
		make( tab , TAB_LIST.length , 0 )
		if ( tab.active ) { activeTabId = tab.id }
	}));
}
function onActivated( e ) {
	try { document.getElementById( activeTabId ).classList.remove( "active" ) }	catch ( e ) {} // sometimes document.getElementById( activeTabId ) doesn't exist but it doesn't matter either way.
	activeTabId = e.tabId;
	document.getElementById( activeTabId ).classList.add( "active" );
}
function onCreated( tab ) {
	let parent = getIndex( activeTabId );
	let notChild = tab.title == "New Tab" || tab.openerTabId == undefined;
	let index = notChild ? TAB_LIST.length : parent + 1;
	let indent = notChild ? 0 : TAB_LIST[parent].indent + 1; // instead of TAB_LIST[parent] I may need the child's parent tab. For if the child tab isn't the first child of parent (not relevant when children open as firstChild)
	make( tab , index , indent );
	browser.tabs.move( tab.id , { "index" : index } ); // I need this so ctrl-tab and the like work correctly
	if ( indent > 0 ) { showOrHideChildren( getParent( index ) , "show" ) }
}
function onRemoved( tabId , removeInfo ) {
	let index = getIndex( tabId );
	let parent = getParent( index )
	let i = index + 1;
	while ( TAB_LIST[i] && TAB_LIST[i].indent > TAB_LIST[index].indent ) { // un-indent following tabs which are more indented that this tab.
		TAB_LIST[i].indent--;
		setMargin( document.getElementById( TAB_LIST[i].id ) , TAB_LIST[i].indent );
		i++;
	}
	TAB_LIST.splice( index , 1 );
	document.getElementById( tabId ).remove();
	browser.tabs.get( TAB_LIST[parent].id ).then( tab => onUpdated( tab.id , false , tab ) ); // sets tree twisty of parent

	// browser.sessions.getRecentlyClosed().then( s => {closedTabs = s;console.log( closedTabs );} );
}
function onUpdated( tabId , changeInfo , tab ) {
	try { document.getElementById( tabId ).replaceWith( makeElem( tab ) ) } catch ( e ) {} // document.getElementById( tabId ) sometimes doesn't exist yet. It never actually matters though.
}
let OPTIONS = 0;
let activeTabId , TAB_LIST = [], TABS_ELEM, closedTabs;
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


// think about whether or not I want double click required to expand/contract tab trees.

// tree twisties before undo close tab

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


