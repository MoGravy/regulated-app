export function matthewEnquiryHref(email) {
  if (typeof email !== 'string' || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return null
  const params = new URLSearchParams({ subject: 'One-to-one programme enquiry from Regulated' })
  return `mailto:${email}?${params.toString()}`
}
