export const TOURNAMENT_FLOW_GUIDE = {
  title: 'How tournaments run',
  summary:
    'All tournaments follow the same flow. Players join, play normal rounds within a time limit, and winners advance when each round ends. Knockout begins once half the original field or fewer remain.',
  sections: [
    {
      title: 'Normal rounds',
      body: 'Players enter the queue and get matched by skill tier. Each normal round has a deadline you set (minutes, hours, or days — e.g. 2 days). When the round expires, players with the best records advance to the next round.',
    },
    {
      title: 'Buybacks',
      body: 'Before knockout starts, eliminated players can buy back in and rejoin the queue for the current round — as long as the round deadline has not passed and more than half the original field is still competing.',
    },
    {
      title: 'Knockout',
      body: 'When active players drop to 50% or fewer of the starting field, the tournament moves to a knockout bracket. From there it is win-and-advance until a champion is crowned. Buybacks are no longer available.',
    },
    {
      title: 'Venue slots',
      body: 'Booked venue time slots must fall within the active round window. Matches are only scheduled into slots that end before the round deadline.',
    },
  ],
} as const;
