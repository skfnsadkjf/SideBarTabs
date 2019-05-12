function getTab( elem ) {
	return elem.classList.contains( "tab" ) ? elem : elem.tagName == "BODY" ? undefined : getTab( elem.parentElement );
}
function getTabId( elem ) {
	return parseInt( getTab( elem ).id );
}
function closeTab( e ) {
	browser.tabs.remove( getTabId( e.target ) );
}
function newTab( e ) {
	if ( e.button == 0 ) {
		browser.tabs.create( {} );
	}
}
function hideChildren( e ) {
	PORT.postMessage( { "hideChildren" : { "id" : getTabId( e.target ) } , "windowId" : WINDOW_ID } );
}
function dblclick( e ) {
	if ( !e.target.className.match( /triangle|expand/ ) ) {
		hideChildren( e );
	}
}
function setMargin( elem , indent ) {
	elem.firstElementChild.style["margin-left"] = String( 10 * indent ) + "px";
}
function pinTab( e ) {
	PORT.postMessage( { "pin" : { "id" : e.target.getAttribute( "data-tabId" ) } , "windowId" : WINDOW_ID } );
}
function clicked( e ) {
	if ( e.button == 0 ) {
		if ( e.target.className.match( /triangle|expand/ ) ) {
			hideChildren( e );
		}
		else if ( e.target.className == "childCount" ) {
			closeTab( e );
		}
		else {
			browser.tabs.update( getTabId( e.target ) , { "active" : true } );
		}
	}
	if ( e.button == 1 ) {
		closeTab( e );
	}
}
function contextMenu( e ) {
	e.preventDefault();
	let elem = getTab( e.target );
	let pinned = elem.getAttribute( "data-pinned" ) === "true";
	MENU.innerText = ( pinned ) ? "Unpin tab" : "Pin tab";
	MENU.setAttribute( "data-tabId" , elem.id );
	MENU.setAttribute( "data-pinned" , pinned );
	MENU.style.display = "";
	MENU.style.top = e.pageY + "px";
	MENU.style.left = e.pageX + "px";
}
function contextMenuOnClick( e ) {
	MENU.style.display = "none";
	let id = parseInt( MENU.getAttribute( "data-tabId" ) );
	let pinned = MENU.getAttribute( "data-pinned" ) === "true";
	PORT.postMessage( { "pin" : { "id" : id , "pinTab" : !pinned } , "windowId" : WINDOW_ID } )
	// browser.tabs.update( id , { "pinned" : !pinned } );
}
function dragover( e ) {
	let elem = getTab( e.target );
	if ( elem != undefined && elem.id != e.dataTransfer.getData( "tab" ) ) {
		e.preventDefault();
		let x = e.pageX - elem.offsetLeft;
		let y = e.pageY - elem.offsetTop;
		let n = Math.floor( ( y / elem.offsetHeight ) * 3 );
		HOVER.className = "drag" + n.toString();
		HOVER.style.display = "";
	}
	if ( elem == undefined ) {
		e.preventDefault();
		HOVER.className = "drag2";
		HOVER.style.display = "";
		TABS_ELEM.lastElementChild.previousElementSibling.firstElementChild.appendChild( HOVER );
	}
}
function drop( e ) {
	HOVER.style.display = "none"
	let elem = getTab( e.target );
	let data = e.dataTransfer.getData( "tab" );
	let to , type , from = parseInt( data );
	if ( elem != undefined && elem.id != data ) {
		let y = e.pageY - elem.offsetTop;
		to = getTabId( elem );
		type = ( y <= 4 ) ? 0 : ( y <= 10 ) ? 1 : 2;
		PORT.postMessage( { "move" : { "from" : from , "to" : to , "type" : type } , "windowId" : WINDOW_ID } );
	}
	if ( elem == undefined ) {
		to = parseInt( TABS_ELEM.children[TABS_ELEM.children.length - 2].id );
		type = 3;
		PORT.postMessage( { "move" : { "from" : from , "to" : to , "type" : type } , "windowId" : WINDOW_ID } );
	}
}
function makeElem( index , tab , data ) {
	let elem = document.importNode( document.getElementById( "tabTemplate" ) , true ).content.firstChild;
	elem.ondragstart = ( e ) => e.dataTransfer.setData( "tab" , e.target.id );
	elem.ondragenter = ( e ) => getTab( e.target.parentElement ).firstElementChild.prepend( HOVER );
	elem.ondragleave = ( e ) => HOVER.style.display = "none";
	elem.ondragend = ( e ) => HOVER.style.display = "none";
	elem.onmousedown = clicked;
	elem.oncontextmenu = contextMenu;
	elem.id = tab.id;
	// elem.querySelector( ".close" ).addEventListener( "click" , closeTab ); // may want to reinstate the "x" to close tabs.
	TABS_ELEM.insertBefore( elem , TABS_ELEM.children[index] );
	update( tab , data );
}
function update( tab , data ) {
	let elem = document.getElementById( data.id );
	setMargin( elem , data.indent );
	if ( elem.querySelector( ".title" ).innerText != tab.title ) {
		elem.querySelector( ".title" ).innerText = tab.title;
	}
	let img = elem.querySelector( ".favicon" ).firstElementChild;
	if ( tab.status == "complete" || !img.src.endsWith( "icons/loading.png" ) ) { // prevents reseting animated image while loading.
		img.src = tab.url == "about:newtab"   ? "" :
	              tab.status != "complete"    ? "icons/loading.png" :
	              tab.favIconUrl == undefined ? "" :
	                                            tab.favIconUrl;
	}
	elem.classList.toggle( "active" , tab.active );
	elem.style.display = ( data.hide ) ? "none" : "";
	elem.querySelector( ".triangle" ).className = ( !data.hasChildren  ) ? "triangle" :
	                                              (  data.hideChildren ) ? "triangle right" : "triangle down";
	elem.ondblclick = ( data.hasChildren ) ? dblclick : undefined;
	elem.querySelector( ".childCount" ).innerText = ( data.hasChildren && data.hideChildren ) ? "(" + data.childCount + ")" : "";
	elem.setAttribute( "data-pinned" , tab.pinned );
}

function messageHandler( message , sender ) {
	if ( message.startup ) {
		browser.windows.getCurrent().then( wind => {
			PORT.postMessage( { "startup" : {} , "windowId" : WINDOW_ID } )
		} );
	}
	if ( message.update ) {
		update( message.update.tab , message.update.data );
	}
	if ( message.create ) {
		makeElem( message.create.index , message.create.tab , message.create.data );
	}
	if ( message.remove ) {
		document.getElementById( message.remove.id ).remove();
	}
	if ( message.hide ) {
		document.getElementById( message.hide.id ).style.display = message.hide.hide ? "none" : "";
	}
	if ( message.indent ) {
		if ( document.getElementById( message.indent.id ) ) {
			setMargin( document.getElementById( message.indent.id ) , message.indent.indent );
		}
	}
	if ( message.active ) {
		if ( document.getElementById( message.active.id ) ) {
			document.getElementById( message.active.id ).classList.add( "active" );
		}
		if ( message.active.prevId != undefined ) {
			document.getElementById( message.active.prevId ).classList.remove( "active" );
		}
	}
	if ( message.move ) {
		let fromElem = TABS_ELEM.children[message.move.from];
		let toIndex = message.move.to + ( message.move.to > message.move.from ? 1 : 0 );
		let toElem = TABS_ELEM.children[toIndex];
		TABS_ELEM.insertBefore( fromElem , toElem );
	}
}

const TABS_ELEM = document.getElementById( "tabList" );
TABS_ELEM.ondrop = drop;
TABS_ELEM.ondragover = dragover;
TABS_ELEM.onclick = e => MENU.style.display = "none";
const HOVER = document.getElementById( "drag" );
const MENU = document.getElementById( "menu" );
MENU.onclick = contextMenuOnClick;
document.getElementById( "newTab" ).onclick = newTab;
let PORT;
let WINDOW_ID;
browser.windows.getCurrent().then( w => {
	WINDOW_ID = w.id;
	PORT = browser.runtime.connect( { "name" : WINDOW_ID.toString() } );
	PORT.onMessage.addListener( messageHandler );
} );




