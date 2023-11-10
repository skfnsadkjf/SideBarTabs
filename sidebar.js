function closeTab( id ) {
	browser.tabs.remove( id );
}
function hideChildren( id ) {
	PORT.postMessage( { "hideChildren" : { "id" : id } , "windowId" : WINDOW_ID } );
}
function setMargin( elem , indent ) {
	elem.querySelector( ".tabContent" ).style["margin-left"] = String( 10 * indent ) + "px";
}
const moveTab = ( elem , index ) => {
	const pinned = elem.getAttribute( "data-pinned" ) == "true";
	const pinnedTabs = document.querySelector( "#pinnedTabs" );
	const notPinnedTabs = document.querySelector( "#notPinnedTabs" );
	const list = ( pinned ) ? pinnedTabs : notPinnedTabs;
	const indexTo = index - ( pinned ? 0 : ( pinnedTabs.children.length - 1 ) );
	const elemTo = ( indexTo < list.children.length ) ? list.children[indexTo] : null;
	list.insertBefore( elem , elemTo );
}
function dblclick( e ) {
	if ( !e.target.className.match( /triangle|expand/ ) ) {
		hideChildren( parseInt( e.currentTarget.id ) );
	}
}
function pinTab( e ) {
	PORT.postMessage( { "pin" : { "id" : e.target.getAttribute( "data-tabId" ) } , "windowId" : WINDOW_ID } );
}
function clicked( e ) {
	if ( e.button == 0 ) {
		if ( e.target.className.match( /triangle|expand/ ) ) {
			hideChildren( parseInt( e.currentTarget.id ) );
		}
		else if ( e.target.className == "childCount" ) {
			closeTab( parseInt( e.currentTarget.id ) );
		}
		else {
			browser.tabs.update( parseInt( e.currentTarget.id ) , { "active" : true } );
		}
	}
	if ( e.button == 1 ) {
		e.preventDefault();
		closeTab( parseInt( e.currentTarget.id ) );
	}
}
function contextMenu( e ) {
	e.preventDefault();
	const menu = document.querySelector( "#menu" );
	const pinned = e.currentTarget.getAttribute( "data-pinned" ) === "true";
	menu.innerText = ( pinned ) ? "Unpin tab" : "Pin tab";
	menu.setAttribute( "data-tabId" , e.currentTarget.id );
	menu.setAttribute( "data-pinned" , pinned );
	menu.style.display = "";
	menu.style.top = e.pageY + "px";
	menu.style.left = e.pageX + "px";
	menu.focus( { "focusVisible": false } );
}
function contextMenuOnClick( e ) {
	const menu = document.querySelector( "#menu" );
	const id = parseInt( menu.getAttribute( "data-tabId" ) );
	const pinned = menu.getAttribute( "data-pinned" ) === "true";
	menu.blur();
	PORT.postMessage( { "pin" : { "id" : id , "pinTab" : !pinned } , "windowId" : WINDOW_ID } )
}
function dragover( e ) {
	const elem = e.target.closest( ".tab" );
	const dragElem = document.querySelector( "#drag" );
	if ( elem?.id != e.dataTransfer.getData( "tabId" ) ) {
		e.preventDefault();
		dragElem.style.display = "";
		if ( elem ) {
			const y = e.pageY - elem.offsetTop;
			dragElem.className = ( y <= 4 ) ? "drag0" : ( y <= 10 ) ? "drag1" : "drag2";
		}
		else {
			dragElem.className = "drag2";
			[...document.querySelectorAll( ".tab" )].at( -1 ).prepend( dragElem );
		}
	}
}
function drop( e ) {
	document.querySelector( "#drag" ).style.display = "none";
	const elem = e.target.closest( ".tab" );
	const id = e.dataTransfer.getData( "tabId" );
	const from = parseInt( id );
	const to = ( elem ) ? parseInt( elem.id ) : parseInt( [...document.querySelectorAll( ".tab" )].at( -1 ).id );
	const y = ( elem ) ? e.pageY - elem.offsetTop : undefined;
	const type = ( y <= 4 ) ? 0 : ( y <= 10 ) ? 1 : ( y != undefined ) ? 2 : 3;
	PORT.postMessage( { "move" : { "from" : from , "to" : to , "type" : type } , "windowId" : WINDOW_ID } );
}
function update( tab , data ) {
	const elem = document.getElementById( data.id );
	const img = elem.querySelector( ".favicon" ).firstElementChild;
	const favIconUrl = ( tab.favIconUrl && tab.url != "about:newtab" ) ? tab.favIconUrl : "";
	if ( tab.status == "complete" || !img.src.endsWith( "icons/loading.png" ) ) { // if required to prevent reseting animated loading image.
		img.src = ( tab.status == "complete" ) ? favIconUrl : "icons/loading.png";
	}
	setMargin( elem , data.indent );
	elem.querySelector( ".title" ).innerText = tab.title;
	elem.classList.toggle( "active" , tab.active );
	elem.style.display = ( data.hide ) ? "none" : "";
	elem.querySelector( ".triangle" ).classList.toggle( "right" , data.hasChildren && data.hideChildren );
	elem.querySelector( ".triangle" ).classList.toggle( "down" , data.hasChildren && !data.hideChildren );
	elem.ondblclick = ( data.hasChildren ) ? dblclick : undefined;
	elem.querySelector( ".childCount" ).innerText = ( data.hasChildren && data.hideChildren ) ? "(" + data.childCount + ")" : "";
	elem.setAttribute( "data-pinned" , tab.pinned );
	moveTab( elem , tab.index );
}
function makeElem( index , tab , data ) {
	const elem = document.importNode( document.getElementById( "tabTemplate" ) , true ).content.firstChild;
	elem.ondragstart = e => e.dataTransfer.setData( "tabId" , e.target.id );
	elem.ondragenter = e => e.target.closest( ".tabContent" ).prepend( document.querySelector( "#drag" ) );
	elem.ondragleave = e => document.querySelector( "#drag" ).style.display = "none";
	elem.ondragend = e => document.querySelector( "#drag" ).style.display = "none";
	elem.onmousedown = clicked;
	elem.oncontextmenu = contextMenu;
	elem.id = tab.id;
	const tabs = document.querySelectorAll( ".tab" );
	elem.setAttribute( "data-pinned" , tab.pinned );
	moveTab( elem , index );
	elem.scrollIntoView( { "block" : "nearest" } );
	update( tab , data );
}
function messageHandler( message , sender ) {
	if ( message.startup ) {
		browser.windows.getCurrent().then( win => {
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
			document.getElementById( message.active.id ).scrollIntoView( { "block" : "nearest" } );
		}
		if ( message.active.prevId != undefined ) {
			document.getElementById( message.active.prevId ).classList.remove( "active" );
		}
	}
	if ( message.move ) {
		const elem = document.querySelectorAll( ".tab" )[message.move.from];
		const index = message.move.to + ( message.move.to > message.move.from ? 1 : 0 );
		const tabs = document.querySelectorAll( ".tab" );
		moveTab( elem , index );
	}
}

document.querySelector( "#tabList" ).addEventListener( "drop" , drop );
document.querySelector( "#tabList" ).addEventListener( "dragover" , dragover );
document.querySelector( "#menu" ).addEventListener( "click" , contextMenuOnClick );
document.querySelector( "#menu" ).addEventListener( "blur" , e => e.target.style.display = "none" );
let PORT;
let WINDOW_ID;
browser.windows.getCurrent().then( w => {
	WINDOW_ID = w.id;
	PORT = browser.runtime.connect( { "name" : WINDOW_ID.toString() } );
	PORT.onMessage.addListener( messageHandler );
} );




