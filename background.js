function findLast( arr , func ) {
	for ( let i = arr.length - 1; i >= 0; i-- ) {
		if ( func( arr[i] ) ) {
			return i;
		}
	}
	return -1;
}


function getIndex( id , win ) {
	return win.tabsInfo.findIndex( v => v.id == id );
}
function getParent( index , win , i = index ) {
	let parentNotFound = i > 0 && win.tabsInfo[i - 1].indent >= win.tabsInfo[index].indent;
	return parentNotFound ? getParent( index , win , i - 1 ) : i - 1;
}
// function hasChildren( index , win.tabsInfo ) {
// 	return win.tabsInfo[index + 1] != undefined && win.tabsInfo[index + 1].indent > win.tabsInfo[index].indent;
// }
function getAncestors( index , win , r = [] ) {
	let parent = getParent( index , win );
	return ( parent > -1 ) ? getAncestors( parent , win , r.concat( parent ) ) : r;
}
function getLastDescendant( index , win ) {
	return win.tabsInfo.findIndex( ( v , i , arr ) => i == arr.length - 1 || i + 1 > index && arr[i + 1].indent <= arr[index].indent );
}
function getChildren( parent , win ) { // only direct children. Not all descendants.
	let lastDescendant = ( parent != -1 ) ? getLastDescendant( parent , win ) : win.tabsInfo.length - 1;
	let indent = ( parent != -1 ) ? win.tabsInfo[parent].indent + 1 : 0;
	let map = win.tabsInfo.map( ( v , i ) => ( i > parent && i <= lastDescendant && v.indent == indent ) ? i : -1 );
	return map.filter( v => v != -1 );
}



function sendMessage( message , win ) {
	if ( win.port ) win.port.postMessage( message );
}
// function sendUpdate( tab , data , win ) {
// 	sendMessage( { "update" : { "tab" : tab , "data" : data } } , win );
// }
function update( index , win ) {
	let data = win.tabsInfo[index];
	// browser.tabs.get( data.id ).then( tab => sendUpdate( tab , data , win ) );
	browser.tabs.get( data.id ).then( tab => {
		sendMessage( { "update" : { "tab" : tab , "data" : data } } , win );
	} );
}
function updateParents( win ) {
	win.tabsInfo.forEach( ( v , i , arr ) => {
		let hasChildren = arr[i + 1] != undefined && arr[i + 1].indent > v.indent;
		if ( v.hasChildren != hasChildren ) {
			v.hasChildren = hasChildren;
			update( i , win );
		}
	} );
}
function hideChildrenRecursive( index , lastDescendant , hide , win ) {
	for ( let i = index + 1; i <= lastDescendant; i++ ) {
		win.tabsInfo[i].hide = hide;
		sendMessage( { "hide" : { "id" : win.tabsInfo[i].id , "hide" : hide } } , win );
		if ( win.tabsInfo[i].hideChildren ) {
			let j = getLastDescendant( i , win );
			i = hideChildrenRecursive( i , j , true , win );
			i = j;
		}
	}
}
function hideChildren( index , hide , win ) {
	win.tabsInfo[index].hideChildren = hide;
	let lastDescendant = getLastDescendant( index , win );
	hideChildrenRecursive( index , lastDescendant , hide , win );
	win.tabsInfo[index].childCount = lastDescendant - index;
	update( index , win );
}
function freeChildren( index , win ) { // assumes tabsInfo[index] is being removed.
	let lastDescendant = getLastDescendant( index , win ); // this must be defined outside the for loop. trust me.
	hideChildrenRecursive( index , lastDescendant , false , win ); // This is what causes: "Error: Invalid tab ID: 45" when called in onRemoved().
	for ( let i = index + 1; i <= lastDescendant; i++ ) {
		win.tabsInfo[i].indent--;
		sendMessage( { "indent" : { "id" : win.tabsInfo[i].id , "indent" : win.tabsInfo[i].indent } } , win );
	}
}
function setSuccessors( win ) {
	win.tabsInfo.forEach( ( v , i , arr ) => {
		let successor = ( arr[i + 1] && v.indent > arr[i + 1].indent ) ? arr[i - 1].id : -1;
		if ( v.successor != successor ) {
			v.successor = successor;
			browser.tabs.update( v.id , { "successorTabId" : successor } );
		}
	} );
}
function saveClosedTabData( index , tabId , win ) {
	let ancestors = getAncestors( index , win );
	let siblings = getChildren( getParent( index , win ) , win );
	let children = getChildren( index , win );
	let childIndex = siblings.findIndex( v => win.tabsInfo[v].id == tabId );
	closedTabs[tabId] = {
		"ancestorIds" : ancestors.map( v => win.tabsInfo[v].id ) ,
		"siblingIds" : siblings.filter( v => v != index ).map( v => win.tabsInfo[v].id ) ,
		"childIds" : children.map( v => win.tabsInfo[v].id ) ,
		"childIndex" : childIndex ,
		"prevSiblingId" : ( childIndex > 0 ) ? win.tabsInfo[siblings[childIndex - 1]].id : undefined ,
		"nextSiblingId" : ( childIndex < siblings.length - 1 ) ? win.tabsInfo[siblings[childIndex + 1]].id : undefined
	};
}
function updateIndents( slice , toIndent , type , win ) {
	let fromIndent = slice[0].indent;
	if ( type == 1 ) toIndent++; // type 0, 1, 2 are before, child of, after.
	if ( type == 3 ) toIndent = 0; // type 3 is when tab is moved to empty space after the last tab.
	slice.forEach( v => {
		v.indent = toIndent + ( v.indent - fromIndent );
		sendMessage( { "indent" : { "id" : v.id , "indent" : v.indent } } , win );
	} );
}
function make( id , win , tab , startup = false ) {
	browser.sessions.setTabValue( tab.id , "oldId" , tab.id );
	// let data = closedTabs[id];
	let data = ( startup ) ? undefined : closedTabs[id];
	let nextSibling = ( data ) ? getIndex( data.nextSiblingId , win ) : -1;
	let prevSibling = ( data ) ? getIndex( data.prevSiblingId , win ) : -1;
	let parent = ( startup              ) ? -1 :
	             ( tab.openerTabId >= 0 ) ? getIndex( tab.openerTabId , win ) :
	             ( data != undefined    ) ? findLast( win.tabsInfo , v => data.ancestorIds.includes( v.id ) ) :
	                                        -1;
	let index = ( startup              ) ? startup.index :
	            ( tab.openerTabId >= 0 ) ? parent + 1 :
	            ( nextSibling     >= 0 ) ? nextSibling:
	            ( prevSibling     >= 0 ) ? getLastDescendant( prevSibling , win ) + 1 :
	            ( parent          >= 0 ) ? parent + 1 :
	                                       win.tabsInfo.length;
	let indent = ( startup              ) ? startup.indent :
	             ( tab.openerTabId >= 0 ) ? win.tabsInfo[parent].indent + 1 :
	             ( nextSibling     >= 0 ) ? win.tabsInfo[nextSibling].indent :
	             ( prevSibling     >= 0 ) ? win.tabsInfo[prevSibling].indent :
	             ( parent          >= 0 ) ? win.tabsInfo[parent].indent + 1 :
	                                        0;
	let ids = [tab.id];
	if ( data ) {
		data.childIds.forEach( v => {
			let index = getIndex( v , win );
			let lastDescendant = getLastDescendant( index , win );
			let slice = win.tabsInfo.slice( index , lastDescendant + 1 );
			updateIndents( slice , indent , 1 , win );
			slice.forEach( w => ids.push( w.id ) );
		} );
	}
	let tabInfo = {
		"id" : tab.id ,
		"indent" : indent ,
		"hide" : ( startup ) ? startup.hide : false ,
		"hasChildren" : ( startup ) ? startup.hasChildren : false ,
		"hideChildren" : ( startup ) ? startup.hideChildren : false ,
		"childCount" : ( startup ) ? startup.childCount : 0 ,
		"successor" : -1
	};
	let tabIndex = Math.min( tab.index , win.tabsInfo.length ); // used for bug when tab.index is higher than window.tabs.length.
	win.tabsInfo.splice( tabIndex , 0 , tabInfo );
	// win.tabsInfo.splice( tab.index , 0 , tabInfo );
	sendMessage( { "create" : { "tab" : tab , "data" : tabInfo , "index" : tabIndex } } , win );
	// sendMessage( { "create" : { "tab" : tab , "data" : tabInfo , "index" : tab.index } } , win );

	browser.tabs.move( ids , { "index" : index } ).then( v => {
		if ( parent >= 0 ) {
			hideChildren( parent , false , win );
		}
		if ( ids.length >= 2 ) {
			hideChildren( getIndex( tab.id , win ) , false , win );
		}
		if ( !startup ) {
			updateParents( win );
			setSuccessors( win );
			save();
		}
		delete closedTabs[id];
	} );
}



function onActivated( activeInfo ) {
	let win = WINDOWS[activeInfo.windowId];
	let ancestors = getAncestors( getIndex( activeInfo.tabId , win ) , win );
	sendMessage( { "active" : { "id" : activeInfo.tabId , "prevId" : activeInfo.previousTabId } } , win );
	ancestors.forEach( index => { // makes descendants are showing children and therefore active tab is visible.
		hideChildren( index , false , win );
	})
}
function onUpdated( tabId , changeInfo , tab ) {
	let win = WINDOWS[tab.windowId];
	let data = win.tabsInfo[getIndex( tabId , win )];
	if ( data != undefined ) {
		sendMessage( { "update" : { "tab" : tab , "data" : data } } , win )
	}
}
function onMoved( tabId , moveInfo ) {
	let win = WINDOWS[moveInfo.windowId];
	let fromIndex = Math.min( moveInfo.fromIndex , win.tabsInfo.length - 1 ); // used for bug when tab.index is higher than window.tabs.length.
	let from = win.tabsInfo.splice( fromIndex , 1 )[0];
	win.tabsInfo.splice( moveInfo.toIndex , 0 , from );
	sendMessage( { "move" : { "to" : moveInfo.toIndex , "from" : fromIndex } } , win );
	updateParents( win );
	setSuccessors( win );
	save();
}
function onRemoved( tabId , removeInfo ) {
	let win = WINDOWS[removeInfo.windowId];
	let index = getIndex( tabId , win );
	saveClosedTabData( index , tabId , win );
	freeChildren( index , win ); // This is what causes: "Error: Invalid tab ID: 45"
	win.tabsInfo.splice( index , 1 );
	sendMessage( { "remove" : { "id" : tabId } } , win );
	updateParents( win );
	setSuccessors( win );
	save();
}
function onCreated( tab ) {
	let win = getWin( tab.windowId );
	browser.sessions.getTabValue( tab.id , "oldId" ).then( id => make( id , win , tab ) );
}
function onAttached( tabId , attachInfo ) {
	browser.tabs.get( tabId ).then( tab => {
		let data = detachedTabsInfo.shift();
		data.index = attachInfo.newPosition;
		make( tabId , WINDOWS[attachInfo.newWindowId] , tab , data )
	} );
}
function onDetached( tabId , detachInfo ) {
	onRemoved( tabId , { "windowId" : detachInfo.oldWindowId } );
}
function messageHandler( message , sender ) {
	let win = WINDOWS[message.windowId];
	let tabsInfo = WINDOWS[message.windowId].tabsInfo;
	if ( message.startup ) {
		win.port = sender;
		browser.tabs.query( { "windowId" : message.windowId } ).then( tabs => {
			tabs.forEach( ( tab , i ) => {
				let data = win.tabsInfo[i];
				sendMessage( { "create" : { "tab" : tab , "data" : data , "index" : i } } , win );
			} );
		} );
	}
	if ( message.hideChildren ) {
		let index = getIndex( message.hideChildren.id , win );
		let hide = !win.tabsInfo[index].hideChildren;
		hideChildren( index , hide , win );
		save();
	}
	if ( message.move ) { // when the user drags a tab in the sideBar ui.
		browser.tabs.get( message.move.from ).then( from => {
			let winFrom = WINDOWS[from.windowId];
			let oldIndex = getIndex( message.move.from , winFrom );
			let oldLastDescendant = getLastDescendant( oldIndex , winFrom );
			let moveTo = getIndex( message.move.to , win );
			if ( from.windowId == message.windowId && message.move.type != 3 && moveTo >= oldIndex && moveTo <= oldLastDescendant ) {
				return; // if moving to same location or to child of the tab you're trying to move.
			}
			let slice = winFrom.tabsInfo.slice( oldIndex , oldLastDescendant + 1 );
			updateIndents( slice , win.tabsInfo[moveTo].indent , message.move.type , win );
			if ( moveTo > oldIndex && from.windowId == message.windowId ) moveTo--;
			if ( message.move.type > 0 ) moveTo++;
			let moveTabs = slice.map( v => v.id );
			if ( from.windowId == message.windowId ) { // moving from/to the same window
				browser.tabs.move( moveTabs , { "index" : moveTo } ).then( v => {
					if ( moveTo == oldIndex ) { // only do when onMoved isn't called, because onMoved does all this.
						updateParents( win );
						setSuccessors( win );
						save();
					}
				} );
			}
			else { // moving from/to different windows
				detachedTabsInfo = JSON.parse( JSON.stringify( slice ) );
				for ( let i = 0; i < moveTabs.length; i++ ) {
					browser.tabs.move( moveTabs[i] , { "windowId" : message.windowId , "index" : moveTo + i } );
				}
			}
		} );
	}
	if ( message.pin ) {
		let index = getIndex( message.pin.id , win );
		win.tabsInfo[index].indent = 0;
		browser.tabs.update( message.pin.id , { "pinned" : message.pin.pinTab } );
	}
}



function save() {
	Object.keys( WINDOWS ).forEach( key => {
		WINDOWS[key].tabsInfo.forEach( info => {
			browser.sessions.setTabValue( info.id , "data" , info );
		} );
	} );
}
function getWin( windowId ) {
	if ( WINDOWS[windowId] == undefined ) { // makes data structure when a new window is created.
		WINDOWS[windowId] = { "port" : undefined , "tabsInfo" : [] };
	}
	return WINDOWS[windowId];
}
function connected( port ) {
	port.onMessage.addListener( messageHandler );
	port.postMessage( { "startup" : 1 } );
}
function startup() {
	browser.windows.getAll( { "populate" : true } ).then( windows => {
		windows.forEach( w => {
			let win = getWin( w.id );
			w.tabs.forEach( tab => {
				browser.sessions.getTabValue( tab.id , "data" ).then( d => {
					data = ( d ) ? d : { "indent" : 0 , "hide" : false , "hasChildren" : false , "hideChildren" : false , "childCount" : 0 };
					data.index = win.tabsInfo.length;
					make( undefined , win , tab , data );
				} );
			} );
		} );
	} );
}


let startupCompleted = false;
let startupPorts = []; // list of ports awaiting startup()'s completion. Only used once after startup.
let WINDOWS = {}; // = { "id" : { "port" : port , "tabsInfo" : TAB_LIST } , "id" : { ... } , ... }
let closedTabs = {};
let detachedTabsInfo = []; // temporary storage because sessions api doesn't retain data for tabs moved to other windows.

browser.runtime.onConnect.addListener( connected );
browser.tabs.onActivated.addListener( onActivated );
browser.tabs.onAttached.addListener( onAttached );
browser.tabs.onCreated.addListener( onCreated );
browser.tabs.onDetached.addListener( onDetached );
browser.tabs.onMoved.addListener( onMoved );
browser.tabs.onRemoved.addListener( onRemoved );
browser.tabs.onUpdated.addListener( onUpdated );
browser.windows.onRemoved.addListener( id => delete WINDOWS[id] );
startup();



//======= fixed but uncommited/uploaded to mdn =========

// bug: dragging below last tab still has visual bug where the black borders

//================== needed changes ====================

// need to scroll sidebar such that activeTab is always on screen.

//================== ideal changes =====================

// close tree/children context menu options.

//================= possible changes ===================

// maybe 18 high tabs instead of 16.

// undo close tab:
	// maybe only return children into place if they're still a descendant of parent.

// do things with options.

// can take elems children by inserting as next sibling when elem has children.
	// not sure if this is a bug or a feature.

// maybe set successor of a new non-child tab to be the previously acitve tab, only until active tab changes.
	// probably a bad call.

// do somthing about behaviour after last tab closed and undo last tab is done.
	// I'm thinking I'll wait to see if it gets fixed.
		// I'm not sure what the problem was, but I can't reproduce it.
	// I could just restart the addon after this happens, or reset the window's tabsInfo.

//====================== notes =========================

// Can't set a custom favIcon for pages without favIcons because:
	// all new tabs briefly have the url "about:blank" and status "complete".
	// all tabs have a brief period while loading where they have both status "complete" and favIconUrl undefined.

//====================== tests =========================

// move tab
// move tab to new parent
// move tab with children
// close tab
// close tab with children
// close tab with parent
// create tab with ctrl-t/search
// create tab with middle click
// restore closed tab
// restore closed tab that had children
// restore closed tab whose old index is greater than window.tabs.length
// think up some visual tests.


























	// if ( message.move ) { // when the user drags a tab in the sideBar ui.
	// 	let oldIndex = getIndex( message.move.from , tabsInfo );
	// 	let oldLastDescendant = getLastDescendant( oldIndex , tabsInfo );
	// 	let moveTo = getIndex( message.move.to , tabsInfo );
	// 	if ( message.move.type != 3 && moveTo >= oldIndex && moveTo <= oldLastDescendant ) return; // if moving to same location or to child.

	// 	let slice = tabsInfo.slice( oldIndex , oldLastDescendant + 1 );
	// 	updateIndents( slice , tabsInfo[moveTo].indent , message.move.type , win );
	// 	if ( moveTo > oldIndex ) moveTo--;
	// 	if ( message.move.type > 0 ) moveTo++;
	// 	let moveTabs = slice.map( v => v.id );
	// 	browser.tabs.move( moveTabs , { "index" : moveTo } );
	// }









// function save() {
// 	if ( startupCompleted ) {
// 				browser.tabs.query( {} ).then( tabs => {
// 					tabs.forEach( tab => {
// 						browser.sessions.setTabValue( tab.id , "data" , WINDOWS[tab.windowId].tabsInfo[tab.index] );
// 					} );
// 				} );
// 		// let windowsTabsInfo = Object.keys( WINDOWS ).map( key => WINDOWS[key].tabsInfo );
// 		// browser.storage.local.set( { "data" : JSON.stringify( windowsTabsInfo ) } );
// 	}
// }


// function connected( port ) {
// 	port.onMessage.addListener( messageHandler );
// 	if ( startupCompleted ) {
// 		port.postMessage( { "startup" : 1 } );
// 	}
// 	else {
// 		startupPorts.push( port );
// 	}
// }


// function startup() {
// 	browser.storage.local.get( "data" ).then( savedData => {
// 		browser.windows.getAll( { "populate" : true } ).then( windows => {
// 			if ( savedData.data ) {
// 				savedData.data = JSON.parse( savedData.data );
// 				// console.log( "savedData.data exist" );
// 			}
// 			// else {
// 			// 	console.log( "savedData.data DOES NOT exist" );
// 			// }
// 			windows.forEach( ( w , i ) => {
// 				// if ( WINDOWS[w.id] == undefined ) { // makes data structure when a new window is created.
// 				// 	WINDOWS[w.id] = { "port" : undefined , "tabsInfo" : [] };
// 				// }
// 				// let win = WINDOWS[w.id];
// 				let win = getWin( w.id );
// 				w.tabs.forEach( ( tab , j ) => {
// 					let startup = {
// 						"indent" : 0 ,
// 						"hide" : false ,
// 						"hasChildren" : false ,
// 						"hideChildren" : false
// 					};
// 					if ( savedData.data && savedData.data[i] && savedData.data[i][j] ) {
// 								for ( let key in startup ) {
// 									startup[key] = savedData.data[i][j][key];
// 								}
// 					}
// 					make( undefined , win , tab , startup );
// 						// assume savedData[i] relates to windows[i]
// 						// update savedData's id
// 						// update all tabs' indent, hideChildren and hide attributes.

// 				} );
// 			} );
// 			startupCompleted = true;
// 			startupPorts.forEach( port => port.postMessage( { "startup" : 1 } ) );

// 		} );
// 	} );
// }


// async version of current startup().
		// let dongs = 0;
		// for ( let i = 0; i < windows.length; i++ ) {
		// 	let win = getWin( windows[i].id );
		// 	for ( let j = 0; j < windows[i].tabs.length; j++ ) {
		// 		await browser.sessions.getTabValue( windows[i].tabs[j].id , "data" ).then( v => {
		// 			startup = ( v ) ? v : { "indent" : 0 , "hide" : false , "hasChildren" : false , "hideChildren" : false };
		// 			make( undefined , win , windows[i].tabs[j] , startup );
		// 			dongs += 1;
		// 		} );
		// 	}
		// }
		// console.log( dongs );
