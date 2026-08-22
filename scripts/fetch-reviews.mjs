import fs from 'node:fs';
import path from 'node:path';

const MOVIE_ID = 'tt35519455';
const FILTER_WORDS = ['mitchell', 'tyler'];
const OUTPUT_PATH = path.resolve(process.cwd(), 'reviews.json');

function stripHtml(raw = '') {
  if (!raw) return '';
  const withoutTags = raw.replace(/<[^>]*>/g, ' ');
  return withoutTags.replace(/\s+/g, ' ').trim();
}

function getReviewText(review) {
  const summaryText = review?.summary?.originalText || '';
  const bodyText = review?.text?.originalText?.plaidHtml || '';
  return stripHtml(`${summaryText} ${bodyText}`);
}

function matchesFilter(reviewText) {
  const normalized = String(reviewText || '').toLowerCase();
  return FILTER_WORDS.some((word) => normalized.includes(word));
}

function getAuthorName(review) {
  return review?.author?.username?.text || 'Anonymous';
}

async function fetchReviewsPage({ id, first, after = null }) {
  const query = `
    query Reviews($id: ID!, $first: Int!, $after: ID) {
      title(id: $id) {
        reviews(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              authorRating
              submissionDate
              spoiler
              summary { originalText }
              text { originalText { plaidHtml } }
              author { username { text } }
              helpfulness { upVotes downVotes }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  const response = await fetch('https://caching.graphql.imdb.com/', {
    method: 'POST',
    headers: {
      accept: 'application/graphql+json, application/json',
      'content-type': 'application/json',
      'x-imdb-client-name': 'imdb-web-next',
      'x-imdb-user-language': 'en-US',
      'x-imdb-user-country': 'US',
      'user-agent': 'Mozilla/5.0',
      origin: 'https://www.imdb.com',
      referer: 'https://www.imdb.com/'
    },
    body: JSON.stringify({
      query,
      variables: { id, first, after }
    })
  });

  if (!response.ok) {
    throw new Error(`IMDb request failed with status ${response.status}`);
  }

  const payload = await response.json();

  if (payload?.errors?.length) {
    throw new Error(payload.errors[0].message || 'IMDb returned an error.');
  }

  const reviews = payload?.data?.title?.reviews || { edges: [], pageInfo: {} };
  return {
    edges: reviews.edges || [],
    pageInfo: reviews.pageInfo || {}
  };
}

async function fetchAllReviews() {
  const allEdges = [];
  const seen = new Set();
  let after = null;
  let pageCount = 0;

  while (pageCount < 50) {
    const { edges, pageInfo } = await fetchReviewsPage({
      id: MOVIE_ID,
      first: 25,
      after
    });

    if (!edges.length) break;

    for (const edge of edges) {
      const cursor = edge?.cursor;
      if (cursor && seen.has(cursor)) continue;
      if (cursor) seen.add(cursor);
      allEdges.push(edge);
    }

    const nextCursor = pageInfo?.endCursor;
    if (!pageInfo?.hasNextPage || !nextCursor) break;

    after = nextCursor;
    pageCount += 1;
  }

  return allEdges;
}

function normalizeReview(review) {
  const text = getReviewText(review);
  const author = getAuthorName(review);

  return {
    id: review.id,
    author,
    authorRating: review?.authorRating ?? null,
    submissionDate: review?.submissionDate || null,
    spoiler: Boolean(review?.spoiler),
    helpfulness: {
      upVotes: review?.helpfulness?.upVotes ?? 0,
      downVotes: review?.helpfulness?.downVotes ?? 0
    },
    text,
    summary: review?.summary?.originalText || '',
    rawText: review?.text?.originalText?.plaidHtml || ''
  };
}

async function main() {
  const edges = await fetchAllReviews();
  const reviews = edges
    .map((edge) => edge.node)
    .map(normalizeReview)
    .filter((review) => matchesFilter(`${review.author} ${review.text}`))
    .sort((a, b) => {
      const aDate = new Date(a.submissionDate || 0).getTime();
      const bDate = new Date(b.submissionDate || 0).getTime();
      return bDate - aDate;
    });

  const payload = {
    updatedAt: new Date().toISOString(),
    movieId: MOVIE_ID,
    total: reviews.length,
    reviews
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Saved ${reviews.length} matching reviews to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
