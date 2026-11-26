export function hourMark(moment: Date): Date {
  const copy = new Date(moment.getTime());
  copy.setUTCMinutes(0, 0, 0);
  return copy;
}
