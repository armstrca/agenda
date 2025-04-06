require 'fileutils'
require 'httparty'
require 'json'
require 'fuzzy_match'

API_KEY = 'bbae53ef2bf0eaf40f7d097b245d43b7d2d038c8'
BASE_URL = 'https://comicvine.gamespot.com/api'
RATE_LIMIT_DELAY = 1.2 # Seconds between API calls

def clean_folder_name(folder_name)
  folder_name.gsub(/^\d+\s*/, '').gsub(/[^a-zA-Z0-9\s-]/, '').strip
end

def fetch_resource(resource_type, query)
  response = HTTParty.get("#{BASE_URL}/search/", query: {
    api_key: API_KEY,
    query: query,
    resources: resource_type,
    format: 'json',
    limit: 5
  })

  JSON.parse(response.body)['results'] if response.code == 200
rescue
  nil
end

def find_best_match(results, target, fields)
  return if results.nil? || results.empty?

  matcher = FuzzyMatch.new(results, read: ->(item) { fields.map { |f| item[f] }.join(' ') })
  matcher.find(target)
end

def get_first_issue_date(issue_id)
  sleep(RATE_LIMIT_DELAY)
  response = HTTParty.get("#{BASE_URL}/issue/4000-#{issue_id}/", query: {
    api_key: API_KEY,
    format: 'json'
  })

  if response.code == 200
    issue = JSON.parse(response.body)['results']
    Date.parse(issue['cover_date']).year rescue nil
  end
end

def determine_folder_year(folder_name)
  clean_name = clean_folder_name(folder_name)

  # Try matching Story Arc first
  if story_arcs = fetch_resource('story_arc', clean_name)
    if arc = find_best_match(story_arcs, clean_name, ['name', 'aliases'])
      if first_issue_id = arc['first_appeared_in_issue']['id'] rescue nil
        return get_first_issue_date(first_issue_id)
      end
    end
  end

  sleep(RATE_LIMIT_DELAY)

  # Try matching Volume if Story Arc failed
  if volumes = fetch_resource('volume', clean_name)
    if volume = find_best_match(volumes, clean_name, ['name', 'aliases'])
      return volume['start_year'] if volume['start_year']
    end
  end

  # Fallback to original issue matching
  if issues = fetch_resource('issue', clean_name)
    if issue = find_best_match(issues, clean_name, ['name', 'issue_number'])
      return Date.parse(issue['cover_date']).year rescue nil
    end
  end

  nil
end

source_dir = '/mnt/g/Comics/X-Men'
output_file = '/mnt/g/Comics/X-Men/X-Men_Reading_Order.txt'

folders_with_years = []
threads = []

Dir.foreach(source_dir) do |folder|
  next if folder == '.' || folder == '..'
  folder_path = File.join(source_dir, folder)
  next unless File.directory?(folder_path)

  threads << Thread.new do
    publication_years = []

    Dir.foreach(folder_path) do |file|
      next if file == '.' || file == '..'
      file_path = File.join(folder_path, file)
      next unless File.file?(file_path)

      publication_year = determine_folder_year(file)
      publication_years << publication_year if publication_year
    end

    if publication_years.any?
      most_common_year = publication_years.group_by(&:itself).values.max_by(&:size).first
      folders_with_years << { name: folder, year: most_common_year }
    else
      puts "No publication year found for: #{folder}"
    end
  end
end

# Wait for all threads to complete
threads.each(&:join)

# Sort folders by publication year
folders_with_years.sort_by! { |folder| folder[:year] }

# Write the sorted folders to the output file
File.open(output_file, 'w') do |file|
  folders_with_years.each do |folder|
    file.puts "#{folder[:year]}: #{folder[:name]}"
  end
end

puts "Reading order written to #{output_file}"
