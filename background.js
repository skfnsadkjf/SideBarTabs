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
function freeChildren( index ) {
	let lastDescendant = getLastDescendant( index ); // this must be defined outside the for loop definition. trust me.
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
function save() {
	browser.storage.local.set( { "data" : TAB_LIST } );
}
function onActivated( activeInfo ) {
	sendMessage( { "active" : { "id" : activeInfo.tabId , "prevId" : activeInfo.previousTabId } } );
	showActive( getIndex( activeInfo.tabId ) );
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
	save();

	browser.sessions.getTabValue( tab.id , "data" ).then( v => {
		if ( v ) {
			// move this tab into place
			// move children of this tab into place
		}
		browser.sessions.setTabValue( tab.id , "oldId" , tab.id );
	});
}
let closedTabs = {};
function onRemoved( tabId , removeInfo ) {
	closedTabs[tabId] = { };


	let index = getIndex( tabId );
	let parent = getParent( index ); // needs to be defined before TAB_LIST.splice().
	freeChildren( index );
	TAB_LIST.splice( index , 1 );
	sendMessage( { "remove" : { "id" : tabId } } );
	updateParent( parent );
	setSuccessors();
	save();
}
function onUpdated( tabId , changeInfo , tab ) {
	let data = TAB_LIST[getIndex( tabId )];
	if ( data != undefined ) sendUpdate( tab , data );
}
function onMoved( tabId , moveInfo ) {
	let from = TAB_LIST.splice( moveInfo.fromIndex , 1 )[0];
	TAB_LIST.splice( moveInfo.toIndex , 0 , from );
	sendMessage( { "move" : { "to" : moveInfo.toIndex , "from" : moveInfo.fromIndex } } );
}
function updateIndents( slice , toIndent , type ) {
	let fromIndent = slice[0].indent;
	if ( type == 1 ) toIndent++;
	if ( type == 3 ) toIndent = 0;
	slice.forEach( v => {
		v.indent = toIndent + ( v.indent - fromIndent ) ;
		sendMessage( { "indent" : { "id" : v.id , "indent" : v.indent } } );
	} );
}
function connected( p ) {
	port = p;
	p.onMessage.addListener( ( message , sender ) => {
		if ( message.hideChildren ) {
			let index = getIndex( message.hideChildren.id );
			let hide = !TAB_LIST[index].hideChildren;
			hideChildren( index , hide )
		}
		if ( message.move ) { // when the user drags a tab in the sideBar ui.
			let oldIndex = getIndex( message.move.from );
			let moveTo = getIndex( message.move.to );
			let oldLastDescendant = getLastDescendant( oldIndex );
			if ( message.move.type != 3 && moveTo >= oldIndex && moveTo <= oldLastDescendant ) return; // if moving to same location or to child.
			let slice = TAB_LIST.slice( oldIndex , oldLastDescendant + 1 );
			updateIndents( slice , TAB_LIST[moveTo].indent , message.move.type );
			if ( moveTo > oldIndex ) moveTo--;
			if ( message.move.type > 0 ) moveTo++;
			let moveTabs = slice.map( v => v.id );
			browser.tabs.move( moveTabs , { "index" : moveTo } );
		}
	} );
	TAB_LIST.forEach( ( v , i ) => {
		browser.tabs.get( v.id ).then( tab => {
			sendMessage( { "create" : { "tab" : tab , "data" : v , "index" : i } } );
		} );
	} );
}
function dataInit( savedData ) {
	browser.tabs.query( { "currentWindow" : true } ).then( tabs => {
		if ( savedData ) {
			tabs.forEach( ( v , i ) => {
				savedData[i].id = v.id;
			} );
			TAB_LIST = savedData;
		}
		else {
			tabs.forEach( tab => {
				onCreated( tab , true );
			} );
		}
	} );
}
let port , TAB_LIST = [];
browser.storage.local.get( null , r => {
	// r.data.forEach( v => console.log( v.id ) );
	// console.log( "before is old ids, after is new ids")
	// r.data = false;
	dataInit( r.data );






	// browser.tabs.query( { "currentWindow" : true } ).then( tabs => tabs.forEach( v => console.log( v.id ) ) );
	browser.runtime.onConnect.addListener( connected );

	browser.tabs.onActivated.addListener( onActivated );
	// browser.tabs.onAttached.addListener(); // will probably just call onCreated
	browser.tabs.onCreated.addListener( onCreated ); // need logic for where to put the tab in the list.
	// browser.tabs.onDetached.addListener(); // will probably just call onRemoved
	browser.tabs.onMoved.addListener( onMoved ); // If I remove the tab bar, this wont be nessessary.
	browser.tabs.onRemoved.addListener( onRemoved );
	browser.tabs.onUpdated.addListener( onUpdated );
} );


// instead of using the sessions api for everything, I should only record a tab's id onCreated() and store other data maunaully onRemoved().
// JUST DO THIS!!!!!

// move stuff in message.move to onMoved(). so that I can do sessions api onmoved and oncreated.

// maybe set successor of a new non-child tab to be the previously acitve tab, only until active tab changes.

// save on onCreated, onRemoved, onMoved, onAttached, onDetached.

// remake tree on undo close tab.
// set tab.id in sessions whenever a tab is created
// attach tab data to stored tabId onRemoved
// detect restore closed tab
// on restore apply remembered data.

// get it working in multiple windows.

// on right click open context menu
// do things with options.

// do somthing about behaviour after last tab closed and undo last tab is done.
// I'm thinking I'll wait to see if it gets fixed.


