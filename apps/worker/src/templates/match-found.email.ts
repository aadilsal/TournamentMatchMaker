export function matchFoundEmailHtml(data: {
  opponentUsername: string;
  venueName?: string;
  slotStart?: string;
  confirmUrl: string;
}): string {
  const venueLine = data.venueName
    ? `<p><strong>Venue:</strong> ${data.venueName}</p>`
    : '<p><strong>Mode:</strong> Remote VR match</p>';
  const timeLine = data.slotStart
    ? `<p><strong>Time:</strong> ${new Date(data.slotStart).toLocaleString()}</p>`
    : '';

  return `
    <h1>Match Found!</h1>
    <p>You've been paired with <strong>${data.opponentUsername}</strong>.</p>
    ${venueLine}
    ${timeLine}
    <p><a href="${data.confirmUrl}">Confirm your match</a> within 5 minutes.</p>
  `;
}
