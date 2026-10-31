function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1) return null
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

function anniversary(date, years) {
  const result = new Date(date)
  result.setUTCFullYear(result.getUTCFullYear() + years)
  return result.getUTCFullYear() <= 9999 ? result.toISOString().slice(0, 10) : null
}

/**
 * Calendar assessment only, never permission to delete.
 * Callers must supply current, verified clinical facts and retain their source/version.
 * asOfDate is the Australia/Adelaide calendar date, supplied as YYYY-MM-DD.
 * A hold includes its anniversary day. A February 29 anniversary rolls to March 1
 * in non-leap years. UTC is used only for date arithmetic, never to determine today.
 * Ownership, schema, other holds and provider checks remain separate requirements.
 */
export function assessClinicalRetention(clinicalFacts, asOfDate) {
  const review = reason => ({ status: 'review_required', reason })
  if (!calendarDate(asOfDate)) return review('invalid_as_of_date')
  if (!clinicalFacts || typeof clinicalFacts !== 'object' || Array.isArray(clinicalFacts)) return review('missing_clinical_facts')
  const { lastContactDate, dateOfBirth, everSeenAsMinor } = clinicalFacts
  const contact = calendarDate(lastContactDate)
  const birth = calendarDate(dateOfBirth)
  if (!contact || typeof everSeenAsMinor !== 'boolean' || (!birth && (everSeenAsMinor || dateOfBirth !== undefined))) return review('invalid_clinical_facts')
  if ((birth && dateOfBirth > lastContactDate) || lastContactDate > asOfDate) return review('inconsistent_clinical_dates')
  if (birth && !everSeenAsMinor) {
    const adulthoodDate = anniversary(birth, 18)
    if (!adulthoodDate || lastContactDate < adulthoodDate) return review('inconsistent_minor_history')
  }
  const contactAnniversary = anniversary(contact, 7)
  const birthday25 = everSeenAsMinor ? anniversary(birth, 25) : null
  if (!contactAnniversary || (everSeenAsMinor && !birthday25)) return review('unsupported_retention_date')
  const holdThroughDate = everSeenAsMinor && birthday25 > contactAnniversary ? birthday25 : contactAnniversary
  return { status: asOfDate > holdThroughDate ? 'eligible' : 'held', holdThroughDate }
}
