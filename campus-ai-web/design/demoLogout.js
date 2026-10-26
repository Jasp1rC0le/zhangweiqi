// A design preview owns only its in-memory identity. Never revoke the real
// refresh cookie or broadcast a real-session logout from a synthetic page.
export function createDemoLogout({ auth, navigate }) {
  let pending
  return function logout() {
    if (pending) return pending
    pending = Promise.resolve()
      .then(() => {
        auth.user = null
        auth.token = ''
        return navigate('/design-review.html?page=exit')
      })
      .then(() => ({ navigationHandled: true }))
      .catch(error => {
        pending = null
        throw error
      })
    return pending
  }
}
