// Dismiss only this confirmation; never use the global message-box close operation.
export function createOwnedConfirmationFence({ scope, active, find, close, observe }) {
  const captured=scope()
  let invalid=false,closed=false,stop=null
  function check() {
    invalid ||= !active() || scope()!==captured
    if(!invalid || closed)return false
    const root=find()
    if(root && close(root)){closed=true;stop?.();stop=null;return true}
    if(!stop && observe)stop=observe(check)
    return false
  }
  return { check, invalidate:()=>{invalid=true;return check()}, dispose:()=>{closed=true;stop?.();stop=null} }
}
