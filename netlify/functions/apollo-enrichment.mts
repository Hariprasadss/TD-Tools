import type { Context, Config } from "@netlify/functions";

interface Contact {
  firstName: string;
  lastName: string;
  domain: string;
  email?: string;
}

interface EnrichmentSettings {
  revealPersonalEmails: boolean;
  revealPhoneNumbers: boolean;
  includeSocialProfiles: boolean;
  includeEmploymentHistory: boolean;
}

interface RequestBody {
  apiKey: string;
  contacts: Contact[];
  settings: EnrichmentSettings;
}

const APOLLO_PEOPLE_MATCH_URL = "https://api.apollo.io/api/v1/people/match";
const APOLLO_BULK_PEOPLE_ENRICHMENT_URL = "https://api.apollo.io/api/v1/people/bulk_match";

export default async (req: Request, context: Context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { apiKey, contacts, settings } = body;

    if (!apiKey || !contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields: apiKey and contacts are required' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    const useBulkAPI = contacts.length > 1 && contacts.length <= 10;
    const enrichedContacts = [];
    let totalApiCalls = 0;

    if (useBulkAPI) {
      try {
        const bulkResult = await enrichContactsBulk(apiKey, contacts, settings);
        enrichedContacts.push(...bulkResult.data);
        totalApiCalls += bulkResult.apiCalls;
      } catch (error) {
        console.error('Bulk enrichment failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: `Bulk enrichment failed: ${error.message}`,
          apiCalls: totalApiCalls
        }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
        });
      }
    } else {
      for (const contact of contacts) {
        try {
          const enriched = await enrichSingleContact(apiKey, contact, settings);
          enrichedContacts.push(enriched);
          totalApiCalls++;
        } catch (error) {
          console.error(`Failed to enrich ${contact.firstName} ${contact.lastName}:`, error);
          enrichedContacts.push({
            ...contact,
            enrichmentStatus: 'failed',
            error: error.message
          });
          totalApiCalls++;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: enrichedContacts,
      apiCalls: totalApiCalls,
      message: `Successfully processed ${enrichedContacts.length} contacts`
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
    });
  }
};

async function enrichSingleContact(apiKey: string, contact: Contact, settings: EnrichmentSettings) {
  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      api_key: apiKey,
      first_name: contact.firstName,
      last_name: contact.lastName,
      domain: contact.domain,
      email: contact.email || undefined,
      reveal_personal_emails: settings.revealPersonalEmails || false,
      reveal_phone_number: settings.revealPhoneNumbers || false
    })
  };

  const response = await fetch(APOLLO_PEOPLE_MATCH_URL, requestOptions);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apollo API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (result.person) {
    return mapApolloPersonToContact(contact, result.person);
  } else {
    return {
      ...contact,
      enrichmentStatus: 'failed',
      error: 'No person data found in Apollo database'
    };
  }
}

async function enrichContactsBulk(apiKey: string, contacts: Contact[], settings: EnrichmentSettings) {
  const details = contacts.map(contact => ({
    first_name: contact.firstName,
    last_name: contact.lastName,
    domain: contact.domain,
    email: contact.email || undefined
  }));

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      api_key: apiKey,
      details: details,
      reveal_personal_emails: settings.revealPersonalEmails || false,
      reveal_phone_number: settings.revealPhoneNumbers || false
    })
  };

  const response = await fetch(APOLLO_BULK_PEOPLE_ENRICHMENT_URL, requestOptions);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apollo Bulk API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const enrichedContacts = [];
  
  if (result.matches && Array.isArray(result.matches)) {
    for (let i = 0; i < contacts.length; i++) {
      const originalContact = contacts[i];
      const match = result.matches[i];
      
      if (match && match.person) {
        enrichedContacts.push(mapApolloPersonToContact(originalContact, match.person));
      } else {
        enrichedContacts.push({
          ...originalContact,
          enrichmentStatus: 'failed',
          error: 'No match found in bulk enrichment'
        });
      }
    }
  } else {
    contacts.forEach(contact => {
      enrichedContacts.push({
        ...contact,
        enrichmentStatus: 'failed',
        error: 'Unexpected bulk API response format'
      });
    });
  }

  return {
    data: enrichedContacts,
    apiCalls: 1
  };
}

function mapApolloPersonToContact(originalContact: Contact, apolloPerson: any) {
  const currentEmployment = apolloPerson.employment_history?.find((emp: any) => emp.current);
  
  return {
    ...originalContact,
    email: apolloPerson.email || originalContact.email || '',
    title: apolloPerson.title || currentEmployment?.title || '',
    company: apolloPerson.organization?.name || currentEmployment?.organization_name || '',
    linkedinUrl: apolloPerson.linkedin_url || '',
    phone: apolloPerson.phone_numbers?.[0]?.sanitized_number || '',
    location: [apolloPerson.city, apolloPerson.state, apolloPerson.country]
      .filter(Boolean)
      .join(', ') || '',
    photoUrl: apolloPerson.photo_url || '',
    headline: apolloPerson.headline || '',
    twitterUrl: apolloPerson.twitter_url || '',
    githubUrl: apolloPerson.github_url || '',
    facebookUrl: apolloPerson.facebook_url || '',
    organizationId: apolloPerson.organization_id || '',
    personId: apolloPerson.id || '',
    emailStatus: apolloPerson.email_status || '',
    employmentHistory: apolloPerson.employment_history || [],
    enrichmentStatus: 'success',
    enrichedAt: new Date().toISOString(),
    qualityScore: calculateContactQualityScore(apolloPerson)
  };
}

function calculateContactQualityScore(person: any): number {
  let score = 0;
  
  if (person.email && person.email_status === 'verified') score += 35;
  else if (person.email) score += 20;
  
  if (person.linkedin_url) score += 25;
  if (person.title) score += 20;
  if (person.organization?.name) score += 15;
  if (person.city || person.state) score += 10;
  if (person.phone_numbers?.length > 0) score += 10;
  if (person.twitter_url || person.github_url) score += 5;
  
  return Math.min(100, score);
}

export const config: Config = {
  path: "/api/apollo-enrichment"
};
