function findLast( arr , func ) {
	for ( let i = arr.length - 1; i >= 0; i-- ) {
		if ( func( arr[i] ) ) {
			return i;
		}
	}
	return -1;
}
function getWin( windowId ) {
	if ( WINDOWS[windowId] == undefined ) { // makes data structure when a new window is created.
		WINDOWS[windowId] = { "port" : undefined , "tabsInfo" : [] };
	}
	return WINDOWS[windowId];
}
function getIndex( id , win ) {
	return win.tabsInfo.findIndex( v => v.id == id );
}
function getParent( index , win ) {
	return findLast( win.tabsInfo , v => v.indent < win.tabsInfo[index].indent );
}
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
	win.port?.postMessage( message );
}
function update( index , win ) {
	let data = win.tabsInfo[index];
	browser.tabs.get( data.id ).then( tab => {
		sendMessage( { "update" : { "tab" : tab , "data" : data } } , win );
	} );
}
function updateParents( win ) {
	win.tabsInfo.forEach( ( v , i , arr ) => {
		const hasChildren = i + 1 < arr.length && arr[i + 1].indent > v.indent;
		if ( v.hasChildren != hasChildren ) {
			v.hasChildren = hasChildren;
			update( i , win );
		}
	} );
}
function setSuccessors( win ) {
	win.tabsInfo.forEach( ( v , i , arr ) => {
		const successor = ( arr[i + 1] && v.indent > arr[i + 1].indent ) ? arr[i - 1].id : -1;
		if ( v.successor != successor ) {
			v.successor = successor;
			browser.tabs.update( v.id , { "successorTabId" : successor } );
		}
	} );
}
function save() {
	Object.values( WINDOWS ).forEach( win => {
		win.tabsInfo.forEach( info => {
			browser.sessions.setTabValue( info.id , "data" , info );
		} );
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
function saveClosedTabData( index , tabId , win ) {
	let ancestors = getAncestors( index , win );
	let siblings = getChildren( getParent( index , win ) , win );
	let children = getChildren( index , win );
	let childIndex = siblings.findIndex( v => win.tabsInfo[v].id == tabId );
	closedTabs[tabId] = {
		"ancestorIds" : ancestors.map( v => win.tabsInfo[v].id ) ,
		"siblingIds" : siblings.filter( v => v != index ).map( v => win.tabsInfo[v].id ) ,
		"childIds" : children.map( v => win.tabsInfo[v].id ) ,
		"childIndex" : childIndex , // childIndex is neer referenced outside this function, so I don't think it needs to be part of closedTabs[]. It does define newt/prevSiblingId though.
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
function make( win , tab , data , oldId , startup = false ) {
	browser.sessions.setTabValue( tab.id , "oldId" , tab.id );
	const restoredTab = oldId ? closedTabs[oldId] : undefined;
	const nextSibling = ( restoredTab ) ? getIndex( restoredTab.nextSiblingId , win ) : -1;
	const prevSibling = ( restoredTab ) ? getIndex( restoredTab.prevSiblingId , win ) : -1;
	const parent = ( tab.openerTabId >= 0 ) ? getIndex( tab.openerTabId , win ) :
	               ( restoredTab          ) ? findLast( win.tabsInfo , v => restoredTab.ancestorIds.includes( v.id ) ) :
	                                          -1;
	const index = ( data                 ) ? data.index :
	              ( tab.openerTabId >= 0 ) ? parent + 1 :
	              ( nextSibling     >= 0 ) ? nextSibling :
	              ( prevSibling     >= 0 ) ? getLastDescendant( prevSibling , win ) + 1 :
	              ( parent          >= 0 ) ? parent + 1 :
	                                         win.tabsInfo.length;
	const indent = ( data                 ) ? data.indent :
	               ( tab.openerTabId >= 0 ) ? win.tabsInfo[parent].indent + 1 :
	               ( nextSibling     >= 0 ) ? win.tabsInfo[nextSibling].indent : // This sibling stuff is neccessary!!!
	               ( prevSibling     >= 0 ) ? win.tabsInfo[prevSibling].indent :
	               ( parent          >= 0 ) ? win.tabsInfo[parent].indent + 1 :
	                                          0;
	let ids = [tab.id]; // tabIds to move after creation, restoring a closed tab may result it moving more than one tab.
	if ( restoredTab ) {
		restoredTab.childIds.forEach( v => {
			const childIndex = getIndex( v , win );
			if ( childIndex >= 0 ) {
				const lastDescendant = getLastDescendant( childIndex , win );
				const slice = win.tabsInfo.slice( childIndex , lastDescendant + 1 );
				updateIndents( slice , indent , 1 , win );
				slice.forEach( w => ids.push( w.id ) );
			}
		} );
	}
	let tabInfo = {
		"id" : tab.id ,
		"indent" : indent ,
		"hide" : ( data ) ? data.hide : false ,
		"hasChildren" : ( data ) ? data.hasChildren : false ,
		"hideChildren" : ( data ) ? data.hideChildren : false ,
		"childCount" : ( data ) ? data.childCount : 0 ,
		"successor" : -1
	};
	win.tabsInfo.splice( tab.index , 0 , tabInfo );
	sendMessage( { "create" : { "tab" : tab , "data" : tabInfo , "index" : tab.index } } , win );

	browser.tabs.move( ids , { "index" : index } ).then( v => {
		if ( parent >= 0 ) {
			hideChildren( parent , false , win );
		}
		if ( !startup ) {
			updateParents( win );
			setSuccessors( win );
			save();
		}
		if ( restoredTab ) {
			delete closedTabs[oldId];
		}
	} );
}

function onActivated( activeInfo ) {
	const win = WINDOWS[activeInfo.windowId];
	const index = getIndex( activeInfo.tabId , win )
	const ancestors = index >= 0 ? getAncestors( index , win ) : [];
	sendMessage( { "active" : { "id" : activeInfo.tabId , "prevId" : activeInfo.previousTabId } } , win );
	ancestors.forEach( index => { // makes all ancestors show children, therefore active tab is visible.
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
	browser.sessions.getTabValue( tab.id , "oldId" ).then( oldId => make( win , tab , false , oldId ) );
}
function onAttached( tabId , attachInfo ) {
	const win = WINDOWS[attachInfo.newWindowId];
	browser.tabs.get( tabId ).then( tab => {
		let data = detachedTabsInfo.shift();
		data.index = attachInfo.newPosition;
		make( win , tab , data , undefined );
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
			const winFrom = WINDOWS[from.windowId];
			const moveFrom = getIndex( message.move.from , winFrom );
			let moveTo = getIndex( message.move.to , win );
			const oldLastDescendant = getLastDescendant( moveFrom , winFrom );
			if ( from.windowId == message.windowId && message.move.type != 3 && moveTo >= moveFrom && moveTo <= oldLastDescendant ) {
				return; // if moving to same location or to child of the tab you're trying to move.
			}
			let slice = winFrom.tabsInfo.slice( moveFrom , oldLastDescendant + 1 );
			updateIndents( slice , win.tabsInfo[moveTo].indent , message.move.type , win );
			if ( moveTo > moveFrom && from.windowId == message.windowId ) {
				moveTo--;
			}
			if ( message.move.type > 0 ) {
				moveTo++;
			}
			if ( from.windowId != message.windowId ) { // moving from/to a different window
				detachedTabsInfo = JSON.parse( JSON.stringify( slice ) );
			}
			const moveTabs = slice.map( v => v.id );
			browser.tabs.move( moveTabs , { "windowId" : message.windowId , "index" : moveTo } ).then( v => {;
				browser.tabs.update( moveTabs[0] , { "active" : true } );
				updateParents( win );
				setSuccessors( win );
				save();
			} );
		} );
	}
	if ( message.pin ) {
		let index = getIndex( message.pin.id , win );
		win.tabsInfo[index].indent = 0;
		browser.tabs.update( message.pin.id , { "pinned" : message.pin.pinTab } );
	}
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
					make( win , tab , data , undefined , true );
				} );
			} );
		} );
	} );
}


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





//================== needed changes ====================

// give pinned tabs position fixed so that it's always on screen.
	// will probably have to set all tabs to position absolute for this.



//======================= bugs =========================

// sometimes the successor tab is parent rather than sibling.
	// this happens because the successor is the previous active tab sometimes (which is desirable if for example I google something then close the google page)
	// solution is to set successors differently if I go from parent to descendant.
	// UPDATE. This may be fixed right now, I can't reproduce it.

// can still append tabs past newTab elem sometimes.
	// not sure how to reproduce, but it defs happened.
	// happens when restoring a closed tab that isn't the most recently closed.
	// UPDATE. This may be fixed right now, but I don't know how to test it.

//================= possible changes ===================


// add a hotkey to open the sidebar.

// show tab title on hover
	// maybe also decendant tabs as well.

// close tree/children context menu options.

// investigate browser.menus.overrideContext for sidebar's context menu

// maybe 17 or 18 high tabs instead of 16.

// undo close tab:
	// maybe only return children into place if they're still a descendant of restored parent.
		// this might just make to sense to do. at all.


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







