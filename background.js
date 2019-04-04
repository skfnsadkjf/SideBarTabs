function getIndex( id ) {
	return TAB_LIST.findIndex( v => v.id == id );
}
function hasChildren( i ) {
	return TAB_LIST[i + 1] != undefined && TAB_LIST[i + 1].indent > TAB_LIST[i].indent;
}
function getParent( j , i = j ) {
	return i > 0 && TAB_LIST[i - 1].indent >= TAB_LIST[j].indent ? getParent( j , i - 1 ) : i - 1;
}
function getAncestors( index , r = [] ) {
	let parent = getParent( index );
	return ( parent > -1 ) ? getAncestors( parent , r.concat( parent ) ) : r;
}
function getLastDescendant( parent ) {
	return TAB_LIST.findIndex( ( v , i , arr ) => i == arr.length - 1 || i + 1 > parent && arr[i + 1].indent <= arr[parent].indent );
}
function getChildren( parent ) { // only direct children. Not all descendants.
	let lastDescendant = ( parent != -1 ) ? getLastDescendant( parent ) : TAB_LIST.length - 1;
	let indent = ( parent != -1 ) ? TAB_LIST[parent].indent + 1 : 0;
	return TAB_LIST.filter( ( v , i ) => i > parent && i <= lastDescendant && v.indent == indent );
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
		let successor = ( arr[i + 1] && v.indent > arr[i + 1].indent ) ? arr[i - 1].id : -1;
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
	let notChild = tab.openerTabId == undefined || startup;
	let indent = notChild ? 0 : TAB_LIST[parent].indent + 1;
	make( tab , tab.index , indent );
	browser.sessions.getTabValue( tab.id , "oldId" ).then( id => {
		let index = notChild ? TAB_LIST.length - 1 : parent + 1;


		browser.sessions.setTabValue( tab.id , "oldId" , tab.id );
		let data = closedTabs[id];
		if ( data ) {
			let ancestorIndexes = data.ancestors.map( v => getIndex( v ) );
			let parentId = ancestorIndexes.find( v => v != -1 );
			if ( parentId != undefined ) {
				let parent = getIndex( parentId );
				let siblings = getChildren( parent );
				let nextSibling = getIndex( data.nextSibling );
				let prevSibling = getIndex( data.prevSibling );
				if ( nextSibling > -1 ) { index = nextSibling }
				else if ( prevSibling > -1 ) { index = getLastDescendant( prevSibling ) + 1 }
				else { index = parent + 1 }
			}
			// else {} // Just do nothing because default FF behavior does what I want here.

			// move children of this tab into place
			// browser.tabs.move( data.children , { "index" : newIndex } );
			delete closedTabs[id];
		}
		browser.tabs.move( tab.id , { "index" : index } ).then( v => {
			updateParent( parent );
			if ( indent > 0 ) {
				hideChildren( getParent( index ) , false );
			}
			if ( !startup ) {
				setSuccessors();
			}
			save();
		}); // I need this so ctrl-tab and the like work correctly
	} );
}

let closedTabs = {};
function onRemoved( tabId , removeInfo ) {
	let index = getIndex( tabId );
	let parent = getParent( index ); // needs to be defined before TAB_LIST.splice().
	let ancestors = getAncestors( index );
	let siblings = getChildren( parent );
	let children = getChildren( index );
	let childIndex = siblings.findIndex( v => v.id == tabId );
	freeChildren( index );
	TAB_LIST.splice( index , 1 );
	sendMessage( { "remove" : { "id" : tabId } } );
	updateParent( parent );
	setSuccessors();
	save();
	closedTabs[tabId] = {
		"ancestors" : ancestors.map( v => v.id ) ,
		"siblings" : siblings.map( v => v.id ) ,
		"children" : children.map( v => v.id ) ,
		"childIndex" : childIndex ,
		"prevSibling" : ( childIndex > 0 ) ? siblings[childIndex - 1].id : false ,
		"nextSibling" : ( childIndex < siblings.length - 2 ) ? siblings[childIndex + 1].id : false
	};
}
function onUpdated( tabId , changeInfo , tab ) {
	let data = TAB_LIST[getIndex( tabId )];
	if ( data != undefined ) sendUpdate( tab , data );
}
function onMoved( tabId , moveInfo ) {
	// console.log( TAB_LIST.reduce( ( acc , v ) => acc + " " + v.id , "" ) );
	let from = TAB_LIST.splice( moveInfo.fromIndex , 1 )[0];
	TAB_LIST.splice( moveInfo.toIndex , 0 , from );
	// console.log( TAB_LIST.reduce( ( acc , v ) => acc + " " + v.id , "" ) );
	sendMessage( { "move" : { "to" : moveInfo.toIndex , "from" : moveInfo.fromIndex } } );
	save();
}
function updateIndents( slice , toIndent , type ) {
	let fromIndent = slice[0].indent;
	if ( type == 1 ) toIndent++; // type 0, 1, 2 are before, child of, after.
	if ( type == 3 ) toIndent = 0; // type 3 is when tab is moved to empty space after the last tab.
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

			let oldParent = getParent( oldIndex );
			let oldParentId = oldParent >= 0 ? TAB_LIST[oldParent].id : -1;


			updateIndents( slice , TAB_LIST[moveTo].indent , message.move.type );
			if ( moveTo > oldIndex ) moveTo--;
			if ( message.move.type > 0 ) moveTo++;
			let moveTabs = slice.map( v => v.id );
			browser.tabs.move( moveTabs , { "index" : moveTo } ).then( tabs => {

				if ( oldParent >= 0 ) {
					updateParent( getIndex( oldParentId ) );
				}
				let index = getIndex( tabs[0].id );
				updateParent( getParent( index ) );


			} );
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
			console.log( "data exists" );
			console.log( savedData );
			tabs.forEach( ( v , i ) => {
				savedData[i].id = v.id;
			} );
			TAB_LIST = savedData;
		}
		else {
			console.log( "data DOES NOT exist" );
			tabs.forEach( tab => {
				onCreated( tab , true );
			} );
		}
	} );
}
let port , TAB_LIST = [];


// browser.tabs.query( { "currentWindow" : true } ).then( tabs => tabs.forEach( v => console.log( v.id ) ) );
browser.runtime.onConnect.addListener( connected );

browser.tabs.onActivated.addListener( onActivated );
// browser.tabs.onAttached.addListener(); // will probably just call onCreated
browser.tabs.onCreated.addListener( onCreated ); // need logic for where to put the tab in the list.
// browser.tabs.onDetached.addListener(); // will probably just call onRemoved
browser.tabs.onMoved.addListener( onMoved ); // If I remove the tab bar, this wont be nessessary.
browser.tabs.onRemoved.addListener( onRemoved );
browser.tabs.onUpdated.addListener( onUpdated );
browser.storage.local.get( null , r => {
	// r.data.forEach( v => console.log( v.id ) );
	// console.log( "before is old ids, after is new ids")
	// r.data = false;
	dataInit( r.data );
} );


// get multiple windows working.

// get undo close tab working.

// include visual when dragging below last tab.

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




































