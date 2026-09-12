// Verified against Cold Outreach Pipeline. Field names are the documented V1 contract.
export const AIRTABLE = {
  campaigns: 'tblN5pAOMYychpKBK',
  interactions: 'tblqbyXiQs2ZAHTrH',
  prospects: 'tblVwsTybmO6xNsmY',
  interaction: {
    type: 'Type',
    gmailMessageId: 'Gmail Message ID',
    gmailThreadId: 'Gmail Thread ID',
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
