const MOVIE_ID = 'tt35519455';
const FILTER_WORDS = ['mitchell', 'tyler'];

const resultsContainer = document.getElementById('results');
const statusNode = document.getElementById('status');
const refreshNoteNode = document.getElementById('refresh-note');

function setStatus(message) {
  statusNode.textContent = message;
}

function setRefreshNote(updatedAt) {
  if (!updatedAt) {
    refreshNoteNode.textContent = 'Last updated: loading… · refreshes hourly';
    return;
  }

  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(updatedAt);

  refreshNoteNode.textContent = `Last updated: ${formatted} · refreshes hourly`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHtml(raw = '') {
  if (!raw) {
    return '';
  }

  const template = document.createElement('template');
  template.innerHTML = raw;
  return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
}

function getReviewText(review) {
  return stripHtml(review?.text || '');
}

function getAuthorName(review) {
  return review?.author || 'Anonymous';
}

function formatDate(dateString) {
  if (!dateString) {
    return 'Unknown date';
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function matchesFilter(reviewText) {
  const normalized = (reviewText || '').toLowerCase();
  return FILTER_WORDS.some((word) => normalized.includes(word));
}

function highlightMatches(text = '') {
  const escaped = escapeHtml(text);
  const regex = /(mitchell|tyler)/gi;
  return escaped.replace(regex, '<mark>$&</mark>');
}

async function loadReviews() {
  const url = `reviews.json?t=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Reviews file request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return payload || { reviews: [], updatedAt: null };
}

function renderReviews(reviews) {
  resultsContainer.innerHTML = '';

  if (!reviews.length) {
    resultsContainer.innerHTML = '<div class="empty-state">No reviews matched your Mitchell/Tyler filter.</div>';
    return;
  }

  reviews.forEach((review) => {
    const article = document.createElement('article');
    article.className = 'review-card';

    const text = getReviewText(review);
    const author = getAuthorName(review);
    const rating = review?.authorRating ? `${review.authorRating}/10` : 'No rating';
    const date = formatDate(review?.submissionDate);
    const upVotes = review?.helpfulness?.upVotes ?? 0;
    const downVotes = review?.helpfulness?.downVotes ?? 0;

    article.innerHTML = `
      <div class="review-top">
        <div class="review-meta">
          <span class="author">${escapeHtml(author)}</span>
          <span class="date">${escapeHtml(date)}</span>
        </div>
        <span class="rating">${escapeHtml(rating)}</span>
      </div>
      <p>${highlightMatches(text)}</p>
      <div class="review-footer">
        <span>Helpful: ${upVotes}</span>
        <span>Unhelpful: ${downVotes}</span>
      </div>
    `;

    resultsContainer.appendChild(article);
  });
}

async function init() {
  try {
    const payload = await loadReviews();
    const reviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
    const filteredReviews = reviews
      .filter((review) => matchesFilter(`${review.author} ${review.text}`))
      .sort((a, b) => {
        const aDate = new Date(a.submissionDate || 0).getTime();
        const bDate = new Date(b.submissionDate || 0).getTime();
        return bDate - aDate;
      });
    const updatedAt = payload?.updatedAt ? new Date(payload.updatedAt) : null;

    renderReviews(filteredReviews);
    setRefreshNote(updatedAt);

    if (updatedAt) {
      setRefreshNote(updatedAt);
      setStatus(`${filteredReviews.length} matching review${filteredReviews.length === 1 ? '' : 's'} found.`);
    } else if (filteredReviews.length > 0) {
      setRefreshNote(null);
      setStatus(`${filteredReviews.length} matching review${filteredReviews.length === 1 ? '' : 's'} found.`);
    } else {
      setRefreshNote(null);
      setStatus('No matching reviews found right now.');
    }
  } catch (error) {
    console.error(error);
    resultsContainer.innerHTML = `
      <div class="error-box">
        The browser blocked the IMDb request, or the endpoint rejected the request.
        For a GitHub Pages site, a tiny server-side proxy is usually required for this API.
      </div>
    `;
    setStatus('Unable to load reviews from IMDb in the browser.');
  }
}

document.addEventListener('DOMContentLoaded', init);
