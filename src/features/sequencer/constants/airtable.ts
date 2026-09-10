// Verified against Cold Outreach Pipeline. Field names are the documented V1 contract.
export const AIRTABLE = {
  interactions: 'tblqbyXiQs2ZAHTrH',
  prospects: 'tblVwsTybmO6xNsmY',
  interaction: {
    status: 'Status',
    direction: 'Direction',
    channel: 'Channel',
    subject: 'Subject',
    message: 'Message',
    prospect: 'Prospect',
    createdAt: 'Created At',
    sentAt: 'Sent At',
  },
  prospect: { name: 'Full Name', email: 'Email', company: 'Company' },
} as const;
