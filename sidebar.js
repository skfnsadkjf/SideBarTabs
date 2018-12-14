function getTabId( elem ){
	return elem.classList.contains( "tab" ) ? parseInt( elem.id ) : getTabId( elem.parentElement );
}
function closeTab( e ) {
	browser.tabs.remove( getTabId( e.target ) );
}
function setMargin( elem , indent ) {
	elem.style["margin-left"] = String( 10 * indent ) + "px";
}
function newTab( e ) {
	if ( e.button == 0 ) browser.tabs.create( {} );
}
function dblclick( e ) {
	port.postMessage( { "hideChildren" : { "id" : getTabId( e.target ) } } );
}
function clicked( e ) {
	let tabId = getTabId( e.target );
	if ( e.button == 0 ) {
		browser.tabs.update( tabId , { "active" : true } );
	}
	if ( e.button == 1 ) {
		closeTab( e );
		e.preventDefault();
	}
	// if ( e.button == 2 ) {} // do context menu stuff
}
function makeElem( tab , data ) {
	// console.log( tab.successorTabId );
	let elem = document.importNode( document.getElementById( "tabTemplate" ) , true ).content.firstChild;
	elem.querySelector( ".title" ).innerText = tab.title;
	elem.id = tab.id;
	// elem.querySelector( ".close" ).addEventListener( "click" , closeTab ); // may want to reinstate the "x" to close tabs.
	setMargin( elem , data.indent );
	elem.addEventListener( "mousedown" , clicked );
	elem.addEventListener( "dblclick" , dblclick );
	elem.querySelector( ".expand" ).addEventListener( "mousedown" , dblclick );
	if ( tab.favIconUrl ) { elem.querySelector( ".favicon" ).firstChild.src = tab.favIconUrl }
	if ( tab.active ) { elem.classList.add( "active" ) }

	if ( data.hide ) { elem.style.display = "none" }
	if ( data.hasChildren ) { elem.querySelector( ".triangle" ).classList.add( data.hideChildren ? "right" : "down" ) }

	return elem;
}



let TABS_ELEM , port;
window.onload = function() {
	TABS_ELEM = document.getElementById( "tabList" );
	document.getElementById( "newTab" ).addEventListener( "click" , newTab );

	port = browser.runtime.connect( { name : "sidebar" } );
	port.onMessage.addListener( ( message , sender ) => {
		if ( message.update ) {
			let oldElem = document.getElementById( message.update.data.id );
			let newElem = makeElem( message.update.tab , message.update.data );
			if ( oldElem ) oldElem.replaceWith( newElem ); // sometimes oldElem doesn't exist yet because message.create hasn't finished creating oldElem yet. It doesn't matter though.
		}
		if ( message.create ) {
			let before = TABS_ELEM.children[message.create.index];
			let elem = makeElem( message.create.tab , message.create.data );
			TABS_ELEM.insertBefore( elem , before );
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
		// if ( !document.hidden ) for ( var x in sorting ) doSort( sorting[x] , false );
	});
}