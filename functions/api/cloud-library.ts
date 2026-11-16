import {
  loadUnifiedCloudMirror,
  saveUnifiedCloudMirror,
  mergeRecordsIntoCloudSnapshot,
  UnifiedCloudStoreSnapshot
} from '../../src/services/cloudLibrarySyncService';

let pagesCloudSnapshot: UnifiedCloudStoreSnapshot = loadUnifiedCloudMirror();

export async function onRequestGet(): Promise<Response> {
  return new Response(JSON.stringify(pagesCloudSnapshot), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  try {
    const body = (await context.request.json()) as {
      blocks?: UnifiedCloudStoreSnapshot['blocks'];
      subjects?: UnifiedCloudStoreSnapshot['subjects'];
      topics?: UnifiedCloudStoreSnapshot['topics'];
      terms?: UnifiedCloudStoreSnapshot['terms'];
      sentences?: UnifiedCloudStoreSnapshot['sentences'];
      mediaRecords?: UnifiedCloudStoreSnapshot['mediaRecords'];
    };

    const merged = mergeRecordsIntoCloudSnapshot(pagesCloudSnapshot, {
      blocks: body?.blocks,
      subjects: body?.subjects,
      topics: body?.topics,
      terms: body?.terms,
      sentences: body?.sentences,
      mediaRecords: body?.mediaRecords
    });

    pagesCloudSnapshot = merged.snapshot;
    saveUnifiedCloudMirror(pagesCloudSnapshot);

    return new Response(
      JSON.stringify({
        success: true,
        appliedCount: merged.appliedCount,
        skippedIdenticalCount: merged.skippedIdenticalCount,
        updatedAt: pagesCloudSnapshot.updatedAt
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Cloud library update failed'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}
