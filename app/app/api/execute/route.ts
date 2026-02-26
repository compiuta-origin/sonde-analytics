import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error('Supabase environment variables not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Authenticate the user
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt_id } = await request.json();

    if (!prompt_id) {
      return NextResponse.json(
        { error: 'prompt_id is required' },
        { status: 400 }
      );
    }

    // Verify prompt ownership
    const { data: prompt } = await supabase
      .from('prompts')
      .select('id')
      .eq('id', prompt_id)
      .eq('user_id', user.id)
      .single();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }

    console.log('Calling executor function for prompt:', prompt_id);
    console.log('Using Supabase URL:', supabaseUrl);

    // Call the edge function with service role key
    const functionUrl = `${supabaseUrl}/functions/v1/executor`;
    console.log('Function URL:', functionUrl);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey,
      },
      body: JSON.stringify({ prompt_id }),
    });

    console.log('Function response status:', response.status);

    const data = await response.json();

    if (!response.ok) {
      console.error('Executor function error:', data);
      throw new Error(data.error || 'Execution failed');
    }

    console.log('Executor function response:', data);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
