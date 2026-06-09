export function tournamentRegisteredEmailHtml(data: {
  tournamentName: string;
  startDate: string;
  bracketUrl: string;
}): string {
  return `
    <h1>Registration Confirmed</h1>
    <p>You're registered for <strong>${data.tournamentName}</strong>.</p>
    <p><strong>Starts:</strong> ${new Date(data.startDate).toLocaleString()}</p>
    <p><a href="${data.bracketUrl}">View bracket</a></p>
  `;
}
