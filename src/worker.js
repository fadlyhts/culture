import {
   checkOrigin, errorResponse
}
 from './auth.js';
export {
   GameRoom
}
 from './game-room.js';
export default {
  async fetch(request,env){
    try{
      const url=new URL(request.url);
      if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/j/')){
        if(request.method!=='GET'||url.pathname==='/api/live')checkOrigin(request);
        const id=env.GAME.idFromName('family100');
        return await env.GAME.get(id).fetch(request);
      }
      return await env.ASSETS.fetch(request);
    }
    catch(e){
      return errorResponse(e);
    }
  }
};
