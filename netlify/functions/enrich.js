// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map();

// Helper function to check rate limits
const checkRateLimit = (ip, limit = 100, windowMs = 3600000) => { // 100 requests per hour
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }
  
  const requests = rateLimitStore.get(ip);
  // Remove old requests outside the window
  const validRequests = requests.filter(timestamp => timestamp > windowStart);
  rateLimitStore.set(ip, validRequests);
  
  if (validRequests.length >= limit) {
    return false;
  }
  
  validRequests.push(now);
  rateLimitStore.set(ip, validRequests);
  return true;
};

// Apollo API helper function
const callApolloAPI = async (apiKey, contacts, options = {}) => {
  const apolloUrl = 'https://api.apollo.io/api/v1/people/match';
  
  const requestBody = {
    api_key: apiKey,
    reveal_personal_emails: options.revealPersonalEmails || true,
    reveal_phone_number: options.revealPhoneNumbers || false,
    people: contacts.map(contact => ({
      first_name: contact.firstName,
      last_name: contact.lastName,
      organization_domain: contact.domain,
      email: contact.email || undefined
    }))
  };
  
  try {
    const response = await fetch(apolloUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Apollo API Error: ${response.status} ${response.statusText} - ${errorData}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Apollo API Call Failed:', error);
    throw error;
  }
};

// Process and enrich contact data
const processContacts = (apolloResponse, originalContacts) => {
  const { people = [] } = apolloResponse;
  
  return originalContacts.map((original, index) => {
    const enriched = people[index] || {};
    
    return {
      // Original data
      ...original,
      
      // Enriched data from Apollo
      id: enriched.id || null,
      title: enriched.title || enriched.headline || null,
      company: enriched.organization?.name || null,
      industry: enriched.organization?.industry || null,
      companySize: enriched.organization?.estimated_num_employees || null,
      location: enriched.state || enriched.city ? `${enriched.city || ''}, ${enriched.state || ''}`.trim() : null,
      linkedinUrl: enriched.linkedin_url || null,
      twitterUrl: enriched.twitter_url || null,
      facebookUrl: enriched.facebook_url || null,
      
      // Contact information
      workEmail: enriched.email || null,
      personalEmail: enriched.personal_email || null,
      directPhone: enriched.direct_phone_number || null,
      mobilePhone: enriched.mobile_phone_number || null,
      
      // Employment history
      employmentHistory: enriched.employment_history?.slice(0, 3)?.map(job => ({
        title: job.title,
        company: job.organization_name,
        startDate: job.start_date,
        endDate: job.end_date,
        current: job.current
      })) || [],
      
      // Education
      education: enriched.education?.slice(0, 2)?.map(edu => ({
        school: edu.school_name,
        degree: edu.degree,
        field: edu.field_of_study,
        startDate: edu.start_date,
        endDate: edu.end_date
      })) || [],
      
      // Enrichment metadata
      enrichmentStatus: enriched.id ? 'success' : 'failed',
      enrichmentTimestamp: new Date().toISOString(),
      confidence: enriched.id ? 'high' : 'low',
      dataCompleteness: calculateDataCompleteness(enriched),
      apolloPersonId: enriched.id || null
    };
  });
};

// Calculate data completeness score
const calculateDataCompleteness = (person) => {
  const fields = [
    'title', 'email', 'linkedin_url', 'direct_phone_number',
    'organization', 'city', 'state', 'employment_history'
  ];
  
  let score = 0;
  fields.forEach(field => {
    if (person[field]) {
      score += field === 'employment_history' ? 20 : 10;
    }
  });
  
  return Math.min(100, score);
};

// Validate request data
const validateRequest = (body) => {
  if (!body.apiKey || typeof body.apiKey !== 'string') {
    throw new Error('Valid Apollo API key is required');
  }
  
  if (!body.contacts || !Array.isArray(body.contacts)) {
    throw new Error('Contacts array is required');
  }
  
  if (body.contacts.length === 0) {
    throw new Error('At least one contact is required');
  }
  
  if (body.contacts.length > 25) {
    throw new Error('Maximum 25 contacts per request');
  }
  
  // Validate each contact
  body.contacts.forEach((contact, index) => {
    if (!contact.firstName || !contact.lastName) {
      throw new Error(`Contact at index ${index} must have firstName and lastName`);
    }
  });
  
  return true;
};

// Main handler function (Netlify Functions format)
exports.handler = async (event, context) => {
  const { httpMethod, body, headers } = event;
  const clientIP = headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown';

  // Handle OPTIONS request for CORS
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // Only allow POST requests
  if (httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Method not allowed',
        message: 'Only POST requests are supported'
      })
    };
  }

  try {
    // Rate limiting
    if (!checkRateLimit(clientIP)) {
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          retryAfter: 3600
        })
      };
    }

    // Parse request body
    let requestData;
    try {
      requestData = JSON.parse(body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        })
      };
    }

    // Validate request
    validateRequest(requestData);

    const { apiKey, contacts, options = {} } = requestData;

    // Log request (remove in production or sanitize)
    console.log(`Enriching ${contacts.length} contacts from ${clientIP}`);

    // Call Apollo API
    const apolloResponse = await callApolloAPI(apiKey, contacts, options);
    
    // Process and return enriched data
    const enrichedContacts = processContacts(apolloResponse, contacts);
    
    // Calculate summary statistics
    const stats = {
      totalContacts: contacts.length,
      successfulEnrichments: enrichedContacts.filter(c => c.enrichmentStatus === 'success').length,
      failedEnrichments: enrichedContacts.filter(c => c.enrichmentStatus === 'failed').length,
      averageDataCompleteness: Math.round(
        enrichedContacts.reduce((sum, c) => sum + c.dataCompleteness, 0) / enrichedContacts.length
      ),
      apiCallsUsed: 1,
      creditsUsed: contacts.length,
      processingTime: Date.now() - Date.parse(new Date().toISOString())
    };

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: JSON.stringify({
        success: true,
        data: enrichedContacts,
        stats,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Enrichment Error:', error);
    
    // Handle specific Apollo API errors
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    
    if (error.message.includes('Apollo API Error')) {
      statusCode = 400;
      errorMessage = 'Apollo API request failed';
    } else if (error.message.includes('required') || error.message.includes('Maximum')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message.includes('API key')) {
      statusCode = 401;
      errorMessage = 'Invalid or missing API key';
    }

    return {
      statusCode,
      headers: corsHeaders,
      body: JSON.stringify({
        error: true,
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        timestamp: new Date().toISOString()
      })
    };
  }
};
