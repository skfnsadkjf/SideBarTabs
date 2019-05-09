function findLast( arr , func ) {
	for ( let i = arr.length - 1; i >= 0; i-- ) {
		if ( func( arr[i] ) ) {
			return i;
		}
	}
	return -1;
}


function getIndex( id , tabsInfo ) {
	return tabsInfo.findIndex( v => v.id == id );
}
function getParent( index , tabsInfo , i = index ) {
	let parentNotFound = i > 0 && tabsInfo[i - 1].indent >= tabsInfo[index].indent;
	return parentNotFound ? getParent( index , tabsInfo , i - 1 ) : i - 1;
}
// function hasChildren( index , tabsInfo ) {
// 	return tabsInfo[index + 1] != undefined && tabsInfo[index + 1].indent > tabsInfo[index].indent;
// }
function getAncestors( index , tabsInfo , r = [] ) {
	let parent = getParent( index , tabsInfo );
	return ( parent > -1 ) ? getAncestors( parent , tabsInfo , r.concat( parent ) ) : r;
}
function getLastDescendant( index , tabsInfo ) {
	return tabsInfo.findIndex( ( v , i , arr ) => i == arr.length - 1 || i + 1 > index && arr[i + 1].indent <= arr[index].indent );
}
function getChildren( parent , tabsInfo ) { // only direct children. Not all descendants.
	let lastDescendant = ( parent != -1 ) ? getLastDescendant( parent , tabsInfo ) : tabsInfo.length - 1;
	let indent = ( parent != -1 ) ? tabsInfo[parent].indent + 1 : 0;
	let map = tabsInfo.map( ( v , i ) => ( i > parent && i <= lastDescendant && v.indent == indent ) ? i : -1 );
	return map.filter( v => v != -1 );
}
function sendMessage( message , win ) {
	if ( win.port ) win.port.postMessage( message );
}
function sendUpdate( tab , data , win ) {
	sendMessage( { "update" : { "tab" : tab , "data" : data } } , win );
}
function update( index , win ) {
	let data = win.tabsInfo[index];
	browser.tabs.get( data.id ).then( tab => sendUpdate( tab , data , win ) );
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
function hideChildrenRecursive( parent , hide , win ) {
	let lastDescendant = getLastDescendant( parent , win.tabsInfo );
	for ( let i = parent + 1; i <= lastDescendant; i++ ) {
		win.tabsInfo[i].hide = hide;
		sendMessage( { "hide" : { "id" : win.tabsInfo[i].id , "hide" : hide } } , win );
		if ( win.tabsInfo[i].hideChildren ) {
			i = hideChildrenRecursive( i , true , win );
		}
	}
	return lastDescendant;
}
function hideChildren( index , hide , win ) {
	win.tabsInfo[index].hideChildren = hide;
	hideChildrenRecursive( index , hide , win );
	update( index , win );
}
function freeChildren( index , win ) { // assumes tabsInfo[index] is being removed.
	let lastDescendant = getLastDescendant( index , win.tabsInfo ); // this must be defined outside the for loop. trust me.
	hideChildrenRecursive( index , false , win );
	for ( let i = index + 1; i <= lastDescendant; i++ ) {
		win.tabsInfo[i].indent--;
		sendMessage( { "indent" : { "id" : win.tabsInfo[i].id , "indent" : win.tabsInfo[i].indent } } , win);
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
function make( tab , index , indent , win ) {
	let data = {
		"id" : tab.id,
		"indent" : indent,
		"hide" : false,
		"hasChildren" : false,
		"hideChildren" : false,
		"successor" : -1
	};
	win.tabsInfo.splice( index , 0 , data );
	sendMessage( { "create" : { "tab" : tab , "data" : data , "index" : index } } , win );
}
function saveClosedTabData( index , parent , tabId , win ) {
	let ancestors = getAncestors( index , win.tabsInfo );
	let siblings = getChildren( parent , win.tabsInfo );
	let children = getChildren( index , win.tabsInfo );
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
function onActivated( activeInfo ) {
	let win = WINDOWS[activeInfo.windowId];
	let ancestors = getAncestors( getIndex( activeInfo.tabId , win.tabsInfo ) , win.tabsInfo );
	sendMessage( { "active" : { "id" : activeInfo.tabId , "prevId" : activeInfo.previousTabId } } , win );
	ancestors.forEach( index => { // makes descendants are showing children and therefore active tab is visible.
		hideChildren( index , false , win );
	})
}
function onUpdated( tabId , changeInfo , tab ) {
	let win = WINDOWS[tab.windowId];
	let data = win.tabsInfo[getIndex( tabId , win.tabsInfo )];
	if ( data != undefined ) {
		sendUpdate( tab , data , win );
	}
}
function onMoved( tabId , moveInfo ) {
	let win = WINDOWS[moveInfo.windowId];
	let from = win.tabsInfo.splice( moveInfo.fromIndex , 1 )[0];
	win.tabsInfo.splice( moveInfo.toIndex , 0 , from );
	sendMessage( { "move" : { "to" : moveInfo.toIndex , "from" : moveInfo.fromIndex } } , win );
	save();
}
function onRemoved( tabId , removeInfo ) {
	let win = WINDOWS[removeInfo.windowId];
	let index = getIndex( tabId , win.tabsInfo );
	let parent = getParent( index , win.tabsInfo ); // needs to be defined before win.tabsInfo.splice().
	saveClosedTabData( index , parent , tabId , win );
	freeChildren( index , win ); // This is waht causes: "Error: Invalid tab ID: 45"
	win.tabsInfo.splice( index , 1 );
	sendMessage( { "remove" : { "id" : tabId } } , win );
	updateParents( win );
	setSuccessors( win );
	save();
}
function onCreated( tab , startup = false ) {
	if ( WINDOWS[tab.windowId] == undefined ) { // makes data structure when a new window is created.
		WINDOWS[tab.windowId] = { "port" : undefined , "tabsInfo" : [] };
	}
	let win = WINDOWS[tab.windowId];
	browser.sessions.getTabValue( tab.id , "oldId" ).then( id => {
		browser.sessions.setTabValue( tab.id , "oldId" , tab.id );
		let data = closedTabs[id];
		let nextSibling = ( data ) ? getIndex( data.nextSiblingId , win.tabsInfo ) : -1;
		let prevSibling = ( data ) ? getIndex( data.prevSiblingId , win.tabsInfo ) : -1;
		let parent = ( startup              ) ? -1 :
		             ( tab.openerTabId >= 0 ) ? getIndex( tab.openerTabId , win.tabsInfo ) :
		             ( data != undefined    ) ? findLast( win.tabsInfo , v => data.ancestorIds.includes( v.id ) ) :
		                                        -1;
		let index = ( startup              ) ? win.tabsInfo.length :
		            ( tab.openerTabId >= 0 ) ? parent + 1 :
		            ( nextSibling     >= 0 ) ? nextSibling:
		            ( prevSibling     >= 0 ) ? getLastDescendant( prevSibling , win.tabsInfo ) + 1 :
		            ( parent          >= 0 ) ? parent + 1 :
		                                       win.tabsInfo.length;
		let indent = ( startup              ) ? 0 :
		             ( tab.openerTabId >= 0 ) ? win.tabsInfo[parent].indent + 1 :
		             ( nextSibling     >= 0 ) ? win.tabsInfo[nextSibling].indent :
		             ( prevSibling     >= 0 ) ? win.tabsInfo[prevSibling].indent :
		             ( parent          >= 0 ) ? win.tabsInfo[parent].indent + 1 :
		                                        0;
		let ids = [tab.id];
		if ( data ) {
			data.childIds.forEach( v => {
				let index = getIndex( v , win.tabsInfo );
				let lastDescendant = getLastDescendant( index , win.tabsInfo );
				let slice = win.tabsInfo.slice( index , lastDescendant + 1 );
				updateIndents( slice , indent , 1 , win );
				slice.forEach( w => ids.push( w.id ) );
			} );
		}
		make( tab , tab.index , 0 , win );
		win.tabsInfo[tab.index].indent = indent;
		sendMessage( { "indent" : { "id" : tab.id , "indent" : indent } } , win );
		browser.tabs.move( ids , { "index" : index } ).then( v => {
			if ( parent >= 0 ) {
				hideChildren( parent , false , win );
			}
			if ( ids.length >= 2 ) {
				hideChildren( getIndex( tab.id , win.tabsInfo ) , false , win );
			}
			if ( !startup ) {
				updateParents( win );
				setSuccessors( win );
				save();
			}
			delete closedTabs[id];
		} );
	} );
}
function messageHandler( message , sender ) {
	let win = WINDOWS[message.windowId];
	let tabsInfo = WINDOWS[message.windowId].tabsInfo;
	if ( message.startup ) {
		win.port = sender;
		browser.tabs.query( { "windowId" : message.windowId } ).then( tabs => {
			tabs.forEach( ( tab , i ) => {
				let data = tabsInfo[i];
				sendMessage( { "create" : { "tab" : tab , "data" : data , "index" : i } } , win );
			} );
		} );
	}
	if ( message.hideChildren ) {
		let index = getIndex( message.hideChildren.id , tabsInfo );
		let hide = !tabsInfo[index].hideChildren;
		hideChildren( index , hide , win );
	}
	if ( message.move ) { // when the user drags a tab in the sideBar ui.
		let oldIndex = getIndex( message.move.from , tabsInfo );
		let moveTo = getIndex( message.move.to , tabsInfo );
		let oldLastDescendant = getLastDescendant( oldIndex , tabsInfo );
		if ( message.move.type != 3 && moveTo >= oldIndex && moveTo <= oldLastDescendant ) return; // if moving to same location or to child.
		let slice = tabsInfo.slice( oldIndex , oldLastDescendant + 1 );
		updateIndents( slice , tabsInfo[moveTo].indent , message.move.type , win );
		if ( moveTo > oldIndex ) moveTo--;
		if ( message.move.type > 0 ) moveTo++;
		let moveTabs = slice.map( v => v.id );
		browser.tabs.move( moveTabs , { "index" : moveTo } ).then( tabs => {
			updateParents( win );
			setSuccessors( win );
		} );
	}
}
function save() {
	let windowsTabsInfo = Object.keys( WINDOWS ).map( key => WINDOWS[key].tabsInfo );
	browser.storage.local.set( { "data" : windowsTabsInfo } );
}
function connected( p ) {
	// port = p;
	p.onMessage.addListener( messageHandler );
	p.postMessage( { "startup" : 1 } );
}
function startup() {
	browser.storage.local.get( null ).then( savedData => {
		browser.windows.getAll( { "populate" : true } ).then( windows => {

			// if ( savedData ) {

			// }
			// else {
				// setTimeout( () => {
					// console.log( "data DOES NOT exist" );
					// windows.forEach( v => {
					// 	v.tabs.forEach( tab => {
					// 		onCreated( tab , true );
					// 	} );
					// } );


					console.log( "data DOES NOT exist" );
					windows.forEach( ( v , i ) => {
						v.tabs.forEach( tab => {
							onCreated( tab , true );
						} );
						if ( savedData ) {
							// assume savedData[i] relates to windows[i]
							// update savedData's id
							// update all tabs' indent, hideChildren and hide attributes.

						}
					} );

				// } , 1000 );
			// }
		} );
	} );
}



let WINDOWS = {}; // = { "id" : { "port" : port , "tabsInfo" : TAB_LIST } , "id" : { ... } , ... }
let closedTabs = {};


browser.runtime.onConnect.addListener( connected );
browser.tabs.onActivated.addListener( onActivated );
// browser.tabs.onAttached.addListener(); // will probably just call onCreated
browser.tabs.onCreated.addListener( onCreated ); // need logic for where to put the tab in the list.
// browser.tabs.onDetached.addListener(); // will probably just call onRemoved
browser.tabs.onMoved.addListener( onMoved ); // If I remove the tab bar, this wont be nessessary.
browser.tabs.onRemoved.addListener( onRemoved );
browser.tabs.onUpdated.addListener( onUpdated );
browser.windows.onRemoved.addListener( id => delete WINDOWS[id] );
startup();





// get undo close tab working.
	// returning it to the right position and indentation.

// implement save and load functinality
	// whenever addon is loaded, clean up WINDOWS by removing tabs that don't exist.
	// deal with current tabs not matching saved tabsInfo (e.g. opening a link will open the browser with more tabs).

// add number to indicate how many hidden children a tab has.

// include visual when dragging below last tab.

// implement onAttached and onDetached listeners.

// allow dragging between windows.

// save on onCreated, onRemoved, onMoved, onAttached, onDetached.

// on right click open context menu
// do things with options.

// remake tree on undo close tab.
// set tab.id in sessions whenever a tab is created
// attach tab data to stored tabId onRemoved
// detect restore closed tab
// on restore apply remembered data.

// maybe set successor of a new non-child tab to be the previously acitve tab, only until active tab changes.
	// probably a bad call.

// do somthing about behaviour after last tab closed and undo last tab is done.
	// I'm thinking I'll wait to see if it gets fixed.
		// I'm not sure what the problem was, but I can't reproduce it.
	// I could just restart the addon after this happens, or reset the window's tabsInfo.


















































// old part of onCreated() that begins to work on restoring closed tabs to their correct location.
	// browser.sessions.getTabValue( tab.id , "oldId" ).then( id => {
	// 	let index = notChild ? TAB_LIST.length - 1 : parent + 1;


	// 	browser.sessions.setTabValue( tab.id , "oldId" , tab.id );
	// 	let data = closedTabs[id];
	// 	if ( data ) {
	// 		let ancestorIndexes = data.ancestors.map( v => getIndex( v ) );
	// 		let parentId = ancestorIndexes.find( v => v != -1 );
	// 		if ( parentId != undefined ) {
	// 			let parent = getIndex( parentId );
	// 			let siblings = getChildren( parent );
	// 			let nextSibling = getIndex( data.nextSibling );
	// 			let prevSibling = getIndex( data.prevSibling );
	// 			if ( nextSibling > -1 ) { index = nextSibling }
	// 			else if ( prevSibling > -1 ) { index = getLastDescendant( prevSibling ) + 1 }
	// 			else { index = parent + 1 }
	// 		}
	// 		// else {} // Just do nothing because default FF behavior does what I want here.

	// 		// move children of this tab into place
	// 		// browser.tabs.move( data.children , { "index" : newIndex } );
	// 		delete closedTabs[id];
	// 	}
	// 	browser.tabs.move( tab.id , { "index" : index } ).then( v => {
	// 		updateParent( parent );
	// 		if ( indent > 0 ) {
	// 			hideChildren( getParent( index ) , false );
	// 		}
	// 		if ( !startup ) {
	// 			setSuccessors();
	// 		}
	// 		save();
	// 	}); // I need this so ctrl-tab and the like work correctly
	// } );




// onCreated() is a relatively good working state.
	// if ( tab.openerTabId != undefined ) {
	// 	browser.sessions.setTabValue( tab.id , "oldId" , tab.id );
	// 	let parent = getIndex( tab.openerTabId , win.tabsInfo );
	// 	make( tab , tab.index , win.tabsInfo[parent].indent + 1 , win );
	// 	browser.tabs.move( tab.id , { "index" : parent + 1 } ).then( v => {
	// 		updateParent( parent , win );
	// 		hideChildren( parent , false , win );
	// 		setSuccessors( win );
	// 		save();
	// 	} );
	// }
	// else {
	// 	make( tab , tab.index , 0 , win );
	// 	browser.tabs.move( tab.id , { "index" : win.tabsInfo.length } ).then( v => {
	// 		if ( !startup ) {
	// 			setSuccessors( win );
	// 			save();
	// 		}
	// 	} );
	// 	browser.sessions.getTabValue( tab.id , "oldId" ).then( id => {
	// 		browser.sessions.setTabValue( tab.id , "oldId" , tab.id );
	// 		let data = closedTabs[id];
	// 		if ( data != undefined ) {
	// 			let nextSibling = getIndex( data.nextSiblingId , win.tabsInfo );
	// 			let prevSibling = getIndex( data.prevSiblingId , win.tabsInfo );
	// 			let oldParent = -1;
	// 			for ( let i = win.tabsInfo.length - 1; i >= 0; i-- ) {
	// 				if ( data.ancestorIds.includes( win.tabsInfo[i].id ) ) {
	// 					oldParent = i;
	// 					break;
	// 				}
	// 			}
	// 			let index = ( nextSibling > -1 ) ? nextSibling :
	// 			            ( prevSibling > -1 ) ? getLastDescendant( prevSibling , win.tabsInfo ) + 1 :
	// 			            ( oldParent   >= 0 ) ? oldParent + 1 :
	// 			                                   win.tabsInfo.length;
	// 			let indent = ( nextSibling > -1 ) ? win.tabsInfo[nextSibling].indent :
	// 			             ( prevSibling > -1 ) ? win.tabsInfo[prevSibling].indent :
	// 			             ( oldParent   >= 0 ) ? win.tabsInfo[oldParent].indent + 1 :
	// 			                                    0;
	// 			delete closedTabs[id];
	// 		}
	// 		browser.tabs.move( tab.id , { "index" : index } ).then( v => {
	// 			if ( oldParent >= 0 ) {
	// 				win.tabsInfo[index].indent = indent;
	// 				sendMessage( { "indent" : { "id" : tab.id , "indent" : indent } } , win );
	// 				updateParent( oldParent , win );
	// 				hideChildren( oldParent , false , win );
	// 			}
	// 			setSuccessors( win );
	// 			save();
	// 		} );


