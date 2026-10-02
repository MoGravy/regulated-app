export function careAlertTarget(search) {
  const params = new URLSearchParams(search)
  const section = ['tasks', 'messages'].includes(params.get('tab')) ? params.get('tab') : null
  const id = key => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(params.get(key) || '') ? params.get(key) : null
  const client = id('client'), practitioner = id('practitioner')
  return { section, item: id('item'), pair: client && practitioner ? `${client}:${practitioner}` : null }
}
