// Descriptive statistics, not inferential tests or automated outlier removal.
export function describeValues(values) {
  if (!values.length || values.some(v => !Number.isFinite(v))) return null
  let sum = 0, compensation = 0
  for (const value of values) { const adjusted = value - compensation, next = sum + adjusted; compensation = (next - sum) - adjusted; sum = next }
  const mean = sum / values.length
  const squaredDeviation = values.reduce((total,value) => total + (value-mean) ** 2,0)
  const sorted = [...values].sort((a,b)=>a-b), mid = Math.floor(sorted.length/2)
  return {count:values.length,sum,mean,median:sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2,sampleStdDev:values.length>1 ? Math.sqrt(squaredDeviation/(values.length-1)) : null,min:sorted[0],max:sorted.at(-1)}
}
export function describePairs(pairs) {
  if (!pairs.length) return null
  const differences = pairs.map(p=>p.measured-p.reference)
  return {count:pairs.length,bias:describeValues(differences).mean,mae:describeValues(differences.map(Math.abs)).mean,rmse:Math.sqrt(describeValues(differences.map(v=>v*v)).mean)}
}
