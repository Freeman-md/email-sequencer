import { expect, it, vi } from 'vitest';

import { CampaignRepository } from '@/modules/outreach/campaigns/airtable/campaign.repository';

it('maps storage labels into named campaign guidance and rejects incorrect records or malformed lists', async () => {
  const fields = {
    'Campaign Name': 'Clinic outreach',
    Offer: 'Booking workflow',
    'Buyer Roles': ['Owner'],
    Geography: ['UK'],
    'Desired Next Step': 'Send a demo',
    Notes: 'Use verified evidence',
  };
  const request = vi.fn().mockResolvedValue({ id: 'recCampaign', fields });
  const repository = new CampaignRepository({ request });
  await expect(repository.findById('recCampaign')).resolves.toMatchObject({
    name: 'Clinic outreach',
    guidance: {
      offer: 'Booking workflow',
      buyerRoles: ['Owner'],
      geography: ['UK'],
      desiredNextStep: 'Send a demo',
      notes: 'Use verified evidence',
    },
  });
  request.mockResolvedValueOnce({ id: 'recWrong', fields });
  await expect(repository.findById('recCampaign')).rejects.toThrow(
    'different Campaign',
  );
  request.mockResolvedValueOnce({
    id: 'recCampaign',
    fields: { ...fields, 'Buyer Roles': 'Owner' },
  });
  await expect(repository.findById('recCampaign')).rejects.toThrow();
});
