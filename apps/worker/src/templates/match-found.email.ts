export function matchFoundEmailHtml(data: {
  opponentUsername: string;
  venueName?: string;
  slotStart?: string;
  confirmUrl: string;
  autoConfirmed?: boolean;
}): string {
  const venueLine = data.venueName
    ? `<p><strong>Venue:</strong> ${data.venueName}</p>`
    : '<p><strong>Mode:</strong> Remote VR match</p>';
  const timeLine = data.slotStart
    ? `<p><strong>Time:</strong> ${new Date(data.slotStart).toLocaleString()}</p>`
    : '';

  const cta = data.autoConfirmed
    ? `<p>Your match is confirmed — head to your venue or VR headset when ready.</p>
       <p><a href="${data.confirmUrl}">View match details</a></p>`
    : `<p><a href="${data.confirmUrl}">Confirm your match</a> within 5 minutes.</p>`;

  return `
    <h1>${data.autoConfirmed ? 'Your Match Is Ready' : 'Match Found!'}</h1>
    <p>You've been paired with <strong>${data.opponentUsername}</strong>.</p>
    ${venueLine}
    ${timeLine}
    ${cta}
  `;
}
