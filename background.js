function getIndex( id ) {
	return TAB_LIST.findIndex( v => v.id == id );
}
function hasChildren( i ) {
	return TAB_LIST[i + 1] != undefined && TAB_LIST[i + 1].indent > TAB_LIST[i].indent;
}
function getParent( j , i = j ) {
	return i > 0 && TAB_LIST[i - 1].indent >= TAB_LIST[j].indent ? getParent( j , i - 1 ) : i - 1;
}
function getLastDescendant( parent ) {
	return TAB_LIST.findIndex( ( v , i , arr ) => i == arr.length - 1 || i + 1 > parent && arr[i + 1].indent <= arr[parent].indent );
}
function getLastChild( parent ) {
	if ( parent == -1 ) { return TAB_LIST.map( v => v.indent ).lastIndexOf( 0 ) }
	let descendants = TAB_LIST.slice( parent + 1 , getLastDescendant( parent ) + 1 )
	return descendants.map( v => v.indent ).lastIndexOf( TAB_LIST[parent].indent + 1 ) + parent + 1;
}
function sendMessage( message ) {
	if ( port ) port.postMessage( message );
}
function sendUpdate( tab , data ) {
	sendMessage( { "update" : { "tab" : tab , "data" : data } } );
}
function update( index ) {
	let data = TAB_LIST[index];
	browser.tabs.get( data.id ).then( tab => sendUpdate( tab , data ) );
}
function updateParent( index ) {
	if ( index != -1 ) {
		TAB_LIST[index].hasChildren = hasChildren( index );
		update( index )
	}
}
function hideChildrenRecursive( parent , hide ) {
	let lastDescendant = getLastDescendant( parent );
	for ( let i = parent + 1; i <= lastDescendant; i++ ) {
		TAB_LIST[i].hide = hide;
		sendMessage( { "hide" : { "id" : TAB_LIST[i].id , "hide" : hide } } );
		if ( TAB_LIST[i].hideChildren ) { i = hideChildrenRecursive( i , true ) }
	}
	return lastDescendant;
}
function hideChildren( index , hide ) {
	TAB_LIST[index].hideChildren = hide;
	hideChildrenRecursive( index , hide );
	update( index );
}
function freeChildren( index , lastDescendant ) {
	hideChildren( index , false ); // make sure all promoted children are visible
	for ( let i = index + 1; i <= lastDescendant; i++ ) {
		TAB_LIST[i].indent--;
		sendMessage( { "indent" : { "id" : TAB_LIST[i].id , "indent" : TAB_LIST[i].indent } } );
	}
}
function showActive( index ) {
	while ( TAB_LIST[index].hide ) {
		let parent = getParent( index );
		hideChildren( parent , false );
		index = parent;
	}
}
function setSuccessors() {
	TAB_LIST.forEach( ( v , i , arr ) => {
		let successor = arr[i + 1] && v.indent > arr[i + 1].indent ? arr[i - 1].id : -1;
		if ( v.successor != successor ) {
			v.successor = successor;
			browser.tabs.update( TAB_LIST[i].id , { "successorTabId" : successor } );
		}
	} );
}
function make( tab , index , indent ) {
	let data = {
		"id" : tab.id,
		"indent" : indent,
		"hide" : false,
		"hasChildren" : false,
		"hideChildren" : false,
		"successor" : -1
	};
	TAB_LIST.splice( index , 0 , data );
	sendMessage( { "create" : { "tab" : tab , "data" : data , "index" : index } } );
}
async function makeAll() {
	let tabs = await browser.tabs.query( { "currentWindow" : true } );
	// tabs.forEach( tab => make( tab , TAB_LIST.length , 0 ) );
	let j = tabs.length - 1;
	tabs.forEach( ( tab , i ) => onCreated( tab , i != j ) );
	setSuccessors();
}
async function onActivated( activeInfo ) {
	sendMessage( { "active" : { "id" : activeInfo.tabId , "prevId" : activeInfo.previousTabId } } );
	showActive( getIndex( activeInfo.tabId ) );
	console.log( "onActivated" );
}
function onCreated( tab , startup = false ) {
	let parent = getIndex( tab.openerTabId );
	let notChild = tab.title == "New Tab" || tab.openerTabId == undefined || startup;
	let index = notChild ? TAB_LIST.length : parent + 1; // will need to alter "parent + 1" for ctrl+shift+t
	let indent = notChild ? 0 : TAB_LIST[parent].indent + 1;
	make( tab , index , indent );
	updateParent( parent );
	browser.tabs.move( tab.id , { "index" : index } ); // I need this so ctrl-tab and the like work correctly
	if ( indent > 0 ) {
		hideChildren( getParent( index ) , false );
	}
	if ( !startup ) {
		setSuccessors();
	}
	console.log( "onCreated" );
}
function onRemoved( tabId , removeInfo ) {
	let index = getIndex( tabId );
	let parent = getParent( index );
	let lastDescendant = getLastDescendant( index ); // this must be defined outside the for loop. trust me.
	freeChildren( index , lastDescendant );
	TAB_LIST.splice( index , 1 );
	sendMessage( { "remove" : { "id" : tabId } } );
	updateParent( parent );
	setSuccessors();
	// browser.sessions.getRecentlyClosed().then( s => {closedTabs = s;console.log( closedTabs );} );
	console.log( "onRemoved" );
}
function onUpdated( tabId , changeInfo , tab ) {
	let data = TAB_LIST[getIndex( tabId )];
	if ( data != undefined ) sendUpdate( tab , data );
	console.log( "onUpdated" );
}
function connected( p ) {
	port = p;
	p.postMessage( result );
	p.onMessage.addListener( ( message , sender ) => {
		if ( message.hideChildren ) {
			let index = getIndex( message.hideChildren.id );
			let hide = !TAB_LIST[index].hideChildren;
			hideChildren( index , hide )
		}
	} );
	console.log( "dongs3" )
	makeAll();
}
let port , result , TAB_LIST = [];
browser.storage.local.get( null , r => {
	result = r;
	browser.runtime.onConnect.addListener( connected );

	browser.tabs.onActivated.addListener( onActivated )
	// browser.tabs.onAttached.addListener() // will probably just call onCreated
	browser.tabs.onCreated.addListener( onCreated ) // need logic for where to put the tab in the list.
	// browser.tabs.onDetached.addListener() // will probably just call onRemoved
	// browser.tabs.onMoved.addListener() // If I remove the tab bar, this wont be nessessary.
	browser.tabs.onRemoved.addListener( onRemoved )
	browser.tabs.onUpdated.addListener( onUpdated )
} );


// when implement storage
// change makeAll to make all of TAB_LIST independently of onCreated


// save on onCreated, onRemoved, onMoved, onAttached, onDetached.


// do saving and loading tree data. particularly on browser restart.
// do this before undo close tab

// remake tree on undo close tab.

// fix indentation css stuff.

// get it working in multiple windows.

// do setup stuff on browser start.
	// re-set all the ids in TAB_LIST

// enable dragging of tabs

// on right click open context menu
// do things with options.

// do somthing about behaviour after last tab closed and undo last tab is done.
// I'm thinking I'll wait to see if it gets fixed.


