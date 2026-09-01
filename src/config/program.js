import programMap from '../../design/program-map.json'

// The program stays behind a content gate until Matthew has reviewed the
// day-to-session sequencing. While this is false the mode switch shows Program
// as coming soon and Browse is the default experience — brief phase 4.
export const PROGRAM_APPROVED = programMap.approved === true

export const PROGRAM_MAP = programMap
