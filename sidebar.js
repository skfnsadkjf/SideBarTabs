// const MOVE_TO = ["moveToTop" , "moveToCenter" , "moveToBottom"];
const PORT = browser.runtime.connect( { name : "sidebar" } );
const TABS_ELEM = document.getElementById( "tabList" );
const HOVER_ELEM = document.getElementById( "drag" );
let tabToMove;
function getTab( elem ) {
	return elem.classList.contains( "tab" ) ? elem : getTab( elem.parentElement );
}
function getTabId( elem ) {
	return parseInt( getTab( elem ).id );
}
function closeTab( e ) {
	browser.tabs.remove( getTabId( e.target ) );
}
function newTab( e ) {
	if ( e.button == 0 ) browser.tabs.create( {} );
}
function dblclick( e ) {
	PORT.postMessage( { "hideChildren" : { "id" : getTabId( e.target ) } } );
}
function setMargin( elem , indent ) {
	elem.firstElementChild.style["margin-left"] = String( 10 * indent ) + "px";
}
function drag( e ) {
	if ( e.target.tagName == "DIV" && e.target.id != "newTab" && e.target.id != "tabList" ) {
		HOVER_ELEM.style.display = "";
		let x = getTab( e.target ).firstElementChild; // firstElementChild to get the <tbody> rather than <table>
		x.appendChild( HOVER_ELEM );
	}
}
function mouseup( e ) {
	if ( e.target.tagName && HOVER_ELEM.style.display != "none" ) { // checkes to see if mouseup occured in the sideBar window and that the mouse was dragged while mousedown'd.
		let to , type , from = getTabId( tabToMove );
		if ( e.target.classList.contains( "drag" ) ) { // if mouseup is over a tab
			to = getTabId( e.target );
			type = parseInt( e.target.id[4] );
		}
		else { // if mouseup is occurs on the newTab button or in the blank space below that.
			to = parseInt( TABS_ELEM.children[TABS_ELEM.children.length - 2].id );
			type = 3;
		}
		PORT.postMessage( { "move" : { "from" : from , "to" : to , "type" : type } } );
	}
	HOVER_ELEM.style.display = "none";
	document.removeEventListener( "mousemove" , drag );
	document.removeEventListener( "mouseup" , mouseup );
}
function clicked( e ) {
	e.preventDefault();
	if ( e.button == 0 ) {
		tabToMove = getTab( e.target );
		browser.tabs.update( getTabId( e.target ) , { "active" : true } );
		document.addEventListener( "mousemove" , drag );
		document.addEventListener( "mouseup" , mouseup );
	}
	if ( e.button == 1 ) {
		closeTab( e );
	}
	// if ( e.button == 2 ) {} // do context menu stuff
}
function makeElem( tab , data ) {
	let elem = document.importNode( document.getElementById( "tabTemplate" ) , true ).content.firstChild;
	elem.querySelector( ".title" ).innerText = tab.title;
	elem.id = tab.id;
	// elem.querySelector( ".close" ).addEventListener( "click" , closeTab ); // may want to reinstate the "x" to close tabs.
	setMargin( elem , data.indent );
	elem.addEventListener( "mousedown" , clicked );
	if ( tab.favIconUrl ) { elem.querySelector( "IMG" ).src = tab.favIconUrl }
	if ( tab.active ) { elem.classList.add( "active" ) }

	if ( data.hide ) { elem.style.display = "none" }
	if ( data.hasChildren ) {
		elem.querySelector( ".triangle" ).classList.add( data.hideChildren ? "right" : "down" );
		elem.addEventListener( "dblclick" , dblclick );
		elem.querySelector( ".expand" ).addEventListener( "mousedown" , dblclick );
	}

	return elem;
}



document.getElementById( "newTab" ).addEventListener( "click" , newTab );
PORT.onMessage.addListener( ( message , sender ) => {
	if ( message.update ) {
		let oldElem = document.getElementById( message.update.data.id );
		let newElem = makeElem( message.update.tab , message.update.data );
		if ( oldElem ) oldElem.replaceWith( newElem ); // sometimes oldElem doesn't exist yet because message.create hasn't finished creating oldElem yet. It doesn't matter though.
	}
	if ( message.create ) {
		let toElem = TABS_ELEM.children[message.create.index];
		let fromElem = makeElem( message.create.tab , message.create.data );
		TABS_ELEM.insertBefore( fromElem , toElem );
	}
	if ( message.remove ) {
		document.getElementById( message.remove.id ).remove();
	}
	if ( message.hide ) {
		document.getElementById( message.hide.id ).style.display = message.hide.hide ? "none" : "";
	}
	if ( message.indent ) {
		setMargin( document.getElementById( message.indent.id ) , message.indent.indent );
	}
	if ( message.active ) {
		document.getElementById( message.active.id ).classList.add( "active" );
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
} );




